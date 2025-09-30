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
    // mouse.x : timestamp when the particle is created
    float progress = clamp((timestamp - mouse.x) / 5.0 , 0.0, 1.);

    float viewDependentRad = 0.1;
    float rad = viewDependentRad;

    float theta = random * PI2 - PI;

    float x = position.x + rad * cos(theta);
    float y = position.y + rad * sin(theta);
    float z = 0.0;

    vec3 currentPosition = vec3(x, y, z);
    gl_Position = czm_modelViewProjection * vec4(currentPosition, 1.0);

    gl_PointSize = 10.0 * progress;
}`;

export default vs;
