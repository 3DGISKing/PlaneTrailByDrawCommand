const vs = `
precision highp float;
precision highp int;

in vec3 position;
in vec4 random;
in float timestamp;

uniform float pixelSize;
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
    float progress = clamp((sysTimestamp - timestamp) / 10.0 , 0.0, 1.);

    vec3 startPosition = vec3(position.x, position.y, 0.0);

    float diff = 1.0;

    vec3 cPosition = vec3(random.x, random.y, random.z) * 2. - 1.;

    float radian = cPosition.x * PI2 - PI;

    float viewDependentSpreadFactor = 1.0; 

    vec2 xySpread = vec2(cos(radian), sin(radian)) * spread * viewDependentSpreadFactor * mix(1., maxSpread, diff) * cPosition.y;

    vec3 endPosition = startPosition;
    endPosition.xy += xySpread;
    endPosition.z = 0.0; //;

    float positionProgress = cubicOut(progress * random.w);
    vec3 currentPosition = mix(startPosition, endPosition, positionProgress);

    vProgress = progress;
    vRandom = random.w;
    vDiff = diff;
    vSpreadLength = cPosition.y;
   // vPositionZ = position.z;

    gl_Position = czm_modelViewProjection * vec4(currentPosition, 1.0);

    float zFactor = mix(0.0, cPosition.z * maxZ, positionProgress);

    gl_PointSize = max(zFactor * size * diff * pixelRatio, minSize * (pixelRatio > 1. ? 1.3 : 1.));
}`;

export default vs;
