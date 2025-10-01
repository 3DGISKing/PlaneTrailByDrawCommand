const vs = `
precision highp float;
precision highp int;

in vec3 position;
in vec4 mouse;
in float timestamp;

uniform float pixelRatio;
uniform float sysTimestamp;
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
    float progress = clamp((sysTimestamp - timestamp) / 5.0 , 0.0, 1.);

    float diff = 1.0;

    vec3 cPosition = vec3(mouse.y, mouse.z, mouse.w) * 2. - 1.;

    float radian = cPosition.x * PI2 - PI;
    vec2 xySpread = vec2(cos(radian), sin(radian)) * spread * mix(1., maxSpread, diff) * cPosition.y;

    float x = position.x + xySpread.x;
    float y = position.y + xySpread.y;
    float z = 0.0;

    vec3 currentPosition = vec3(x, y, z);
    gl_Position = czm_modelViewProjection * vec4(currentPosition, 1.0);

    gl_PointSize = 10.0 * progress;
}`;

export default vs;
