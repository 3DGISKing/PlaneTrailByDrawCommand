const { BlendingState, Cartesian3, DrawCommand, Geometry, GeometryAttribute, Matrix4, Pass, PrimitiveType, RenderState, ShaderProgram, VertexArray, Viewer } = Cesium;

const UPDATE_COUNT_OF_PARTICLE_COUNT = 1;
const POSITION_ATTRIBUTE_COUNT = 3;
const MOUSE_ATTRIBUTE_COUNT = 4;
const scratchStep = new Cartesian3();
const scratchSubPosition = new Cartesian3();
const scratchLocal = new Cartesian3();

class Trail {
    constructor(scene) {
        this._scene = scene;

        this._totalParticleCount = UPDATE_COUNT_OF_PARTICLE_COUNT * 10;

        const count = this._totalParticleCount;

        this._positions = new Float32Array(count * POSITION_ATTRIBUTE_COUNT);

        this._mouse = new Float32Array(count * MOUSE_ATTRIBUTE_COUNT);
        this._afront = new Float32Array(count * 2);
        this._random = new Float32Array(count);

        const positions = this._positions;
        const mouse = this._mouse;
        const aFront = this._afront;

        this._positionIndex = 0;
        this._mouseIndex = 0;

        for (let i = 0; i < count; i++) {
            positions[i * 3 + 0] = 0;
            positions[i * 3 + 1] = 0;
            positions[i * 3 + 2] = 0;

            mouse[i * 4 + 0] = -1;
            mouse[i * 4 + 1] = Math.random();
            mouse[i * 4 + 2] = Math.random();
            mouse[i * 4 + 3] = Math.random();

            aFront[i * 2 + 0] = 0;
            aFront[i * 2 + 1] = 0;

            this._random[i] = Math.random();
        }

        this._timestamp = 0; // JulianDate.secondsOfDay
        this._oldPosition = null;
        this._modelMatrix = new Matrix4();
        this._inverseModelMatrix = new Matrix4();

        this._update = true;
    }

    isDestroyed() {
        return false;
    }

    _createVertexArray(modelMatrix) {
        Matrix4.clone(modelMatrix, this._modelMatrix);

        Matrix4.inverse(modelMatrix, this._inverseModelMatrix);

        const position = Matrix4.getTranslation(modelMatrix, new Cartesian3());

        const diff = new Cartesian3();

        if (this._oldPosition) {
            Cartesian3.subtract(position, this._oldPosition, diff);
        }

        const totalParticleCount = this._totalParticleCount;

        for (let i = 0; i < UPDATE_COUNT_OF_PARTICLE_COUNT; i++) {
            const ci = (this._positionIndex % (totalParticleCount * POSITION_ATTRIBUTE_COUNT)) + i * POSITION_ATTRIBUTE_COUNT;

            let subPosition = position;

            if (this._oldPosition) {
                const step = Cartesian3.multiplyByScalar(diff, i / UPDATE_COUNT_OF_PARTICLE_COUNT, scratchStep);

                subPosition = Cartesian3.add(this._oldPosition, step, scratchSubPosition);
            }

            const local = Matrix4.multiplyByPoint(this._inverseModelMatrix, subPosition, scratchLocal);

            this._positions[ci + 0] = local.x;
            this._positions[ci + 1] = local.y;
            this._positions[ci + 2] = local.z;
        }

        for (let i = 0; i < UPDATE_COUNT_OF_PARTICLE_COUNT; i++) {
            const ci = (this._mouseIndex % (totalParticleCount * MOUSE_ATTRIBUTE_COUNT)) + i * MOUSE_ATTRIBUTE_COUNT;

            this._mouse[ci + 0] = this._timestamp;
        }

        this._oldPosition = position;
        this._positionIndex += POSITION_ATTRIBUTE_COUNT * UPDATE_COUNT_OF_PARTICLE_COUNT;
        this._mouseIndex += MOUSE_ATTRIBUTE_COUNT * UPDATE_COUNT_OF_PARTICLE_COUNT;

        const geometry = new Geometry({
            attributes: {
                position: new GeometryAttribute({
                    componentDatatype: Cesium.ComponentDatatype.FLOAT,
                    componentsPerAttribute: 3,
                    values: this._positions
                }),

                mouse: new GeometryAttribute({
                    componentDatatype: Cesium.ComponentDatatype.FLOAT,
                    componentsPerAttribute: 4,
                    values: this._mouse
                }),
                aFront: new GeometryAttribute({
                    componentDatatype: Cesium.ComponentDatatype.FLOAT,
                    componentsPerAttribute: 2,
                    values: this._afront
                }),
                random: new GeometryAttribute({
                    componentDatatype: Cesium.ComponentDatatype.FLOAT,
                    componentsPerAttribute: 1,
                    values: this._random
                })
            },
            primitiveType: PrimitiveType.POINTS
        });

        return VertexArray.fromGeometry({
            context: this._scene.context,
            geometry: geometry,
            attributeLocations: {
                position: 0,
                mouse: 1,
                aFront: 2,
                random: 3
            }
        });
    }

    _createDrawCommand(vertexArray) {
        const vs = `
                        precision highp float;
                        precision highp int;

                        in vec3 position;
                        in vec3 rPosition;
                        in vec4 mouse;
                        in vec2 aFront;
                        in float random;
                     
                        uniform float pixelRatio;
                        uniform float timestamp;
                        uniform float size;
                        uniform float minSize;
                        uniform float speed;
                        uniform float far;
                        uniform float spread;
                        uniform float maxSpread;
                        uniform float maxZ;
                        uniform float maxDiff;
                        uniform float diffPow;
                        uniform mat4 modelMatrix;
                        uniform mat4 inverseModelMatrix;

                        out float vProgress;
                        out float vRandom;
                        out float vDiff;
                        out float vSpreadLength;
                        out float vPositionZ;

                        const float PI = 3.1415926;
                        const float PI2 = PI * 2.0;

                        float cubicOut(float t) {
                            float f = t - 1.0;

                            return f * f * f + 1.0;
                        }

                        void main() {
                            float viewDependentRad = 0.1;
                            float rad = viewDependentRad;

                            float theta = random * PI2 - PI;

                            float x = position.x + rad * cos(theta);
                            float y = position.y + rad * sin(theta);
                            float z = 0.0;

                            vec3 currentPosition = vec3(x, y, z);
                            gl_Position = czm_modelViewProjection * vec4(currentPosition, 1.0);

                            gl_PointSize = 5.0;
                        }`;

        const fs = `
                        precision highp float;
             
                        in float vRandom;
                        in float vProgress;
                        in float vSpreadLength;
                        in float vPositionZ;
                        in float vDiff;

                        uniform float fadeSpeed;
                        uniform float shortRangeFadeSpeed;
                        uniform float minFlashingSpeed;
                        uniform float blur;
                        
                        highp float random(vec2 co) {
                            highp float a = 12.9898;
                            highp float b = 78.233;
                            highp float c = 43758.5453;
                            highp float dt = dot(co.xy, vec2(a, b));
                            highp float sn = mod(dt, 3.14);

                            return fract(sin(sn) * c);
                        }

                        float quadraticIn(float t) {
                            return t * t;
                        }

                        #ifndef HALF_PI
                        #define HALF_PI 1.5707963267948966
                        #endif

                        float sineOut(float t) {
                            return sin(t * HALF_PI);
                        }
                       
                        const vec3 baseColor = vec3(170., 133., 88.) / 255.;

                        void main() {
                            out_FragColor = vec4(1.0, 1.0, 0.0, 1.0);
                        }`;

        const shaderProgram = ShaderProgram.fromCache({
            context: this._scene.context,
            vertexShaderSource: vs,
            fragmentShaderSource: fs,
            attributeLocations: {
                position: 0,
                mouse: 1,
                aFront: 2,
                random: 3
            }
        });

        return new DrawCommand({
            vertexArray: vertexArray,
            shaderProgram: shaderProgram,
            uniformMap: {
                pixelRatio: () => window.devicePixelRatio,
                timestamp: () => this._timestamp,
                size: () => 0.05,
                minSize: () => 1,
                speed: () => 0.012,
                fadeSpeed: () => 1.1,
                shortRangeFadeSpeed: () => 1.3,
                minFlashingSpeed: () => 0.1,
                spread: () => 7,
                maxSpread: () => 5,
                maxZ: () => 100,
                blur: () => 1,
                far: () => 10,
                maxDiff: () => 100,
                diffPow: () => 0.24,
                modelMatrix: () => this._modelMatrix,
                inverseModelMatrix: () => this._inverseModelMatrix
            },
            renderState: RenderState.fromCache({
                blending: BlendingState.ADDITIVE_BLEND
            }),
            pass: Pass.OPAQUE,
            primitiveType: PrimitiveType.POINTS,
            modelMatrix: this._modelMatrix
        });
    }

    updatePosition(modelMatrix) {
        this._update = true;

        Matrix4.clone(modelMatrix, this._modelMatrix);
    }

    updateTimestamp(julianDate) {
        this._timestamp = julianDate.secondsOfDay;
    }

    update(frameState) {
        if (this._update) {
            this._update = false;

            if (this._command) {
                this._command.vertexArray.destroy();
                this._command.shaderProgram.destroy();
            }

            const vertexArray = this._createVertexArray(this._modelMatrix);

            this._command = this._createDrawCommand(vertexArray);
        }

        const commandList = frameState.commandList;
        const passes = frameState.passes;

        if (passes.render) {
            commandList.push(this._command);
        }
    }
}

export default Trail;
