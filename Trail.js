const { BlendingState, Cartesian3, DrawCommand, Geometry, GeometryAttribute, Matrix4, Pass, PrimitiveType, RenderState, ShaderProgram, VertexArray, Viewer } = Cesium;

import vs from "./vs.js";
import fs from "./fs.js";

const UPDATE_COUNT_OF_PARTICLE_COUNT = 1;
const POSITION_ATTRIBUTE_COUNT = 3;
const MOUSE_ATTRIBUTE_COUNT = 4;
const scratchStep = new Cartesian3();
const scratchSubPosition = new Cartesian3();
const scratchWorldPosition = new Cartesian3();
const scratchLocal = new Cartesian3();

class Trail {
    constructor(scene) {
        this._scene = scene;

        this._totalParticleCount = UPDATE_COUNT_OF_PARTICLE_COUNT * 360;

        const count = this._totalParticleCount;

        this._positions = new Float32Array(count * POSITION_ATTRIBUTE_COUNT);
        this._worldPositions = new Float32Array(count * POSITION_ATTRIBUTE_COUNT);

        this._mouse = new Float32Array(count * MOUSE_ATTRIBUTE_COUNT);
        this._timestamp = new Float32Array(count);

        const positions = this._positions;
        const mouse = this._mouse;

        this._positionIndex = 0;
        this._mouseIndex = 0;
        this._timestampIndex = 0;

        for (let i = 0; i < count; i++) {
            positions[i * 3 + 0] = 0;
            positions[i * 3 + 1] = 0;
            positions[i * 3 + 2] = 0;

            mouse[i * 4 + 0] = -1;
            mouse[i * 4 + 1] = Math.random();
            mouse[i * 4 + 2] = Math.random();
            mouse[i * 4 + 3] = Math.random();

            this._timestamp[i] = 0;
        }

        this._sysTimestamp = 0; // JulianDate.secondsOfDay
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

            this._worldPositions[ci + 0] = subPosition.x;
            this._worldPositions[ci + 1] = subPosition.y;
            this._worldPositions[ci + 2] = subPosition.z;
        }

        for (let i = 0; i < this._totalParticleCount * 3; i += 3) {
            const worldPosition = scratchWorldPosition;

            worldPosition.x = this._worldPositions[i + 0];
            worldPosition.y = this._worldPositions[i + 1];
            worldPosition.z = this._worldPositions[i + 2];

            const local = Matrix4.multiplyByPoint(this._inverseModelMatrix, worldPosition, scratchLocal);

            this._positions[i + 0] = local.x;
            this._positions[i + 1] = local.y;
            this._positions[i + 2] = local.z;
        }

        for (let i = 0; i < UPDATE_COUNT_OF_PARTICLE_COUNT; i++) {
            const ci = (this._mouseIndex % (totalParticleCount * MOUSE_ATTRIBUTE_COUNT)) + i * MOUSE_ATTRIBUTE_COUNT;

            this._mouse[ci + 0] = this._timestamp;
        }

        for (let i = 0; i < UPDATE_COUNT_OF_PARTICLE_COUNT; i++) {
            const ci = (this._timestampIndex % totalParticleCount) + i * 1;

            this._timestamp[ci + 0] = this._sysTimestamp;
        }

        this._oldPosition = position;
        this._positionIndex += POSITION_ATTRIBUTE_COUNT * UPDATE_COUNT_OF_PARTICLE_COUNT;
        this._mouseIndex += MOUSE_ATTRIBUTE_COUNT * UPDATE_COUNT_OF_PARTICLE_COUNT;
        this._timestampIndex += 1 * UPDATE_COUNT_OF_PARTICLE_COUNT;

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

                timestamp: new GeometryAttribute({
                    componentDatatype: Cesium.ComponentDatatype.FLOAT,
                    componentsPerAttribute: 1,
                    values: this._timestamp
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
                timestamp: 2
            }
        });
    }

    _createDrawCommand(vertexArray) {
        const shaderProgram = ShaderProgram.fromCache({
            context: this._scene.context,
            vertexShaderSource: vs,
            fragmentShaderSource: fs,
            attributeLocations: {
                position: 0,
                mouse: 1,
                timestamp: 2
            }
        });

        return new DrawCommand({
            vertexArray: vertexArray,
            shaderProgram: shaderProgram,
            uniformMap: {
                pixelRatio: () => window.devicePixelRatio,
                sysTimestamp: () => this._sysTimestamp,
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
        this._sysTimestamp = julianDate.secondsOfDay;
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
