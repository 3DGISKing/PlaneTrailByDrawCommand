const { BlendingState, Cartesian2, Cartesian3, DrawCommand, EllipsoidGeodesic, Geometry, GeometryAttribute, JulianDate, Matrix4, Pass, PrimitiveType, RenderState, ShaderProgram, VertexArray } =
    Cesium;

import vs from "./vs.js";
import fs from "./fs.js";

const POSITION_ATTRIBUTE_COUNT = 3;
const RANDOM_ATTRIBUTE_COUNT = 4;

const scratchStep = new Cartesian3();
const scratchSubPosition = new Cartesian3();
const scratchWorldPosition = new Cartesian3();
const scratchLocal = new Cartesian3();

const geodesic = new EllipsoidGeodesic();

class Trail {
    constructor(scene, entity, clock) {
        this._scene = scene;
        this._entity = entity;
        this._clock = clock;

        this._countOfTrailSegment = 360;
        this._countOfParticlePerTrailSegment = 80;

        const totalParticleCount = this._countOfParticlePerTrailSegment * this._countOfTrailSegment;

        this._positions = new Float32Array(totalParticleCount * POSITION_ATTRIBUTE_COUNT);
        this._worldPositions = new Float32Array(totalParticleCount * POSITION_ATTRIBUTE_COUNT);

        this._random = new Float32Array(totalParticleCount * RANDOM_ATTRIBUTE_COUNT);
        this._timestamp = new Float32Array(totalParticleCount);

        const positions = this._positions;
        const random = this._random;

        this._positionIndex = 0;

        this._timestampIndex = 0;

        for (let i = 0; i < totalParticleCount; i++) {
            positions[i * 3 + 0] = 0;
            positions[i * 3 + 1] = 0;
            positions[i * 3 + 2] = 0;

            random[i * 4 + 0] = Math.random();
            random[i * 4 + 1] = Math.random();
            random[i * 4 + 2] = Math.random();
            random[i * 4 + 3] = Math.random();

            this._timestamp[i] = 0;
        }

        this._sysTimestamp = 0; // JulianDate.secondsOfDay
        this._oldPosition = null;
        this._modelMatrix = new Matrix4();
        this._inverseModelMatrix = new Matrix4();
        this._pixelSize = 0;

        this._update = true;

        this._clock.onTick.addEventListener((e) => {
            const time = this._clock.currentTime;

            this._sysTimestamp = time.secondsOfDay;

            const modelMatrix = this._entity.computeModelMatrix(time, new Cesium.Matrix4());

            this._update = true;

            Matrix4.clone(modelMatrix, this._modelMatrix);

            // trail.onTick();
        });
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

        const totalParticleCount = this._countOfParticlePerTrailSegment * this._countOfTrailSegment;

        for (let i = 0; i < this._countOfParticlePerTrailSegment; i++) {
            const ci = (this._positionIndex % (totalParticleCount * POSITION_ATTRIBUTE_COUNT)) + i * POSITION_ATTRIBUTE_COUNT;

            let subPosition = position;

            if (this._oldPosition) {
                const step = Cartesian3.multiplyByScalar(diff, i / this._countOfParticlePerTrailSegment, scratchStep);

                subPosition = Cartesian3.add(this._oldPosition, step, scratchSubPosition);
            }

            this._worldPositions[ci + 0] = subPosition.x;
            this._worldPositions[ci + 1] = subPosition.y;
            this._worldPositions[ci + 2] = subPosition.z;
        }

        for (let i = 0; i < totalParticleCount * 3; i += 3) {
            const worldPosition = scratchWorldPosition;

            worldPosition.x = this._worldPositions[i + 0];
            worldPosition.y = this._worldPositions[i + 1];
            worldPosition.z = this._worldPositions[i + 2];

            const local = Matrix4.multiplyByPoint(this._inverseModelMatrix, worldPosition, scratchLocal);

            this._positions[i + 0] = local.x;
            this._positions[i + 1] = local.y;
            this._positions[i + 2] = local.z;
        }

        for (let i = 0; i < this._countOfParticlePerTrailSegment; i++) {
            const ci = (this._timestampIndex % totalParticleCount) + i * 1;

            this._timestamp[ci + 0] = this._sysTimestamp;
        }

        this._oldPosition = position;
        this._positionIndex += POSITION_ATTRIBUTE_COUNT * this._countOfParticlePerTrailSegment;

        this._timestampIndex += 1 * this._countOfParticlePerTrailSegment;

        const geometry = new Geometry({
            attributes: {
                position: new GeometryAttribute({
                    componentDatatype: Cesium.ComponentDatatype.FLOAT,
                    componentsPerAttribute: 3,
                    values: this._positions
                }),
                random: new GeometryAttribute({
                    componentDatatype: Cesium.ComponentDatatype.FLOAT,
                    componentsPerAttribute: 4,
                    values: this._random
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
                random: 1,
                timestamp: 2
            }
        });
    }

    _createDrawCommand(vertexArray) {
        this._pixelSize = this._calcPixelSize();

        const shaderProgram = ShaderProgram.fromCache({
            context: this._scene.context,
            vertexShaderSource: vs,
            fragmentShaderSource: fs,
            attributeLocations: {
                position: 0,
                random: 1,
                timestamp: 2
            }
        });

        return new DrawCommand({
            vertexArray: vertexArray,
            shaderProgram: shaderProgram,
            uniformMap: {
                pixelSize: () => this._pixelSize,
                pixelRatio: () => window.devicePixelRatio,
                sysTimestamp: () => this._sysTimestamp,
                size: () => 0.05,
                minSize: () => 1,
                speed: () => 0.012,
                fadeSpeed: () => 1.1,
                shortRangeFadeSpeed: () => 1.3,
                minFlashingSpeed: () => 0.1,
                spread: () => 5,
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

    update(frameState) {
        if (this._update) {
            this._update = false;

            if (this._command) {
                this._command.vertexArray.destroy();
                this._command.shaderProgram.destroy();
            }

            const vertexArray = this._createVertexArray(this._modelMatrix);

            this._command = this._createDrawCommand(vertexArray);

            // this._command = this._createDrawCommandTest();
        }

        if (!this._command) {
            return;
        }

        const commandList = frameState.commandList;
        const passes = frameState.passes;

        if (passes.render) {
            commandList.push(this._command);
        }
    }

    _calcPixelSize() {
        const scene = this._scene;

        const width = scene.canvas.clientWidth;
        const height = scene.canvas.clientHeight;

        const centerX = Math.floor(width / 2);
        const centerY = Math.floor(height / 2);

        const globe = scene.globe;

        let leftPosition;
        let rightPosition;

        let leftCartographic;
        let rightCartographic;

        let pixelDistance = -1;

        for (let x = centerX; x < width; x++) {
            for (let y = centerY; y < height; y++) {
                const left = scene.camera.getPickRay(new Cartesian2(x, y));
                const right = scene.camera.getPickRay(new Cartesian2(x + 1, y));

                if (!left) {
                    continue;
                }

                if (!right) {
                    continue;
                }

                leftPosition = globe.pick(left, scene);
                rightPosition = globe.pick(right, scene);

                if (!leftPosition) {
                    continue;
                }

                if (!rightPosition) {
                    continue;
                }

                leftCartographic = globe.ellipsoid.cartesianToCartographic(leftPosition);
                rightCartographic = globe.ellipsoid.cartesianToCartographic(rightPosition);

                geodesic.setEndPoints(leftCartographic, rightCartographic);

                pixelDistance = geodesic.surfaceDistance;

                return pixelDistance;
            }
        }

        return -1.0;
    }

    onTick() {
        const time = this._clock.currentTime;
        this._sysTimestamp = time.secondsOfDay;

        const modelMatrix = this._entity.computeModelMatrix(time, new Cesium.Matrix4());

        Matrix4.clone(modelMatrix, this._modelMatrix);

        Matrix4.inverse(modelMatrix, this._inverseModelMatrix);

        this._update = true;
    }

    _prepareRandom() {
        // for   count = 4800;
        const count = 4800;
        const random = new Float32Array(count * RANDOM_ATTRIBUTE_COUNT);

        for (let i = 0; i < count; i++) {
            random[i * 4 + 0] = Math.random();
            random[i * 4 + 1] = Math.random();
            random[i * 4 + 2] = Math.random();
            random[i * 4 + 3] = Math.random();
        }
    }

    _createDrawCommandTest() {
        const delta = 3;
        const endTime = this._clock.currentTime;
        const startTime = JulianDate.addSeconds(endTime, -delta, new JulianDate());

        const step = 1 / 20;
        const count = (delta / step) * this._countOfParticlePerTrailSegment;

        const positions = new Float32Array(count * POSITION_ATTRIBUTE_COUNT);
        const random = new Float32Array(count * RANDOM_ATTRIBUTE_COUNT);
        const timestamp = new Float32Array(count);

        let timeIndex = 0;
        let oldPosition;
        const diff = new Cartesian3();

        console.time("create");

        for (let t = endTime; JulianDate.lessThan(startTime, t); t = JulianDate.addSeconds(t, -step, new JulianDate())) {
            const position = this._entity.position.getValue(t);

            if (!position) {
                return undefined;
            }

            if (oldPosition) {
                Cartesian3.subtract(position, oldPosition, diff);
            }

            for (let i = 0; i < this._countOfParticlePerTrailSegment; i++) {
                const ci = (timeIndex * this._countOfParticlePerTrailSegment + i) * POSITION_ATTRIBUTE_COUNT;

                let subPosition = position;

                if (oldPosition) {
                    const step = Cartesian3.multiplyByScalar(diff, i / this._countOfParticlePerTrailSegment, scratchStep);

                    subPosition = Cartesian3.add(oldPosition, step, scratchSubPosition);
                }

                const worldPosition = scratchWorldPosition;

                worldPosition.x = subPosition.x;
                worldPosition.y = subPosition.y;
                worldPosition.z = subPosition.z;

                const local = Matrix4.multiplyByPoint(this._inverseModelMatrix, worldPosition, scratchLocal);

                positions[ci + 0] = local.x;
                positions[ci + 1] = local.y;
                positions[ci + 2] = local.z;
            }

            oldPosition = position;

            for (let i = 0; i < this._countOfParticlePerTrailSegment; i++) {
                const ci = (timeIndex * this._countOfParticlePerTrailSegment + i) * RANDOM_ATTRIBUTE_COUNT;

                random[ci + 0] = Math.random();
                random[ci + 1] = Math.random();
                random[ci + 2] = Math.random();
                random[ci + 3] = Math.random();
            }

            for (let i = 0; i < this._countOfParticlePerTrailSegment; i++) {
                const ci = timeIndex * this._countOfParticlePerTrailSegment + i;

                timestamp[ci + 0] = t.secondsOfDay;
            }

            timeIndex++;
        }

        console.timeEnd("create");

        const geometry = new Geometry({
            attributes: {
                position: new GeometryAttribute({
                    componentDatatype: Cesium.ComponentDatatype.FLOAT,
                    componentsPerAttribute: 3,
                    values: positions
                }),
                random: new GeometryAttribute({
                    componentDatatype: Cesium.ComponentDatatype.FLOAT,
                    componentsPerAttribute: 4,
                    values: random
                }),
                timestamp: new GeometryAttribute({
                    componentDatatype: Cesium.ComponentDatatype.FLOAT,
                    componentsPerAttribute: 1,
                    values: timestamp
                })
            },
            primitiveType: PrimitiveType.POINTS
        });

        const vertexArray = VertexArray.fromGeometry({
            context: this._scene.context,
            geometry: geometry,
            attributeLocations: {
                position: 0,
                random: 1,
                timestamp: 2
            }
        });

        return this._createDrawCommand(vertexArray);
    }
}

export default Trail;
