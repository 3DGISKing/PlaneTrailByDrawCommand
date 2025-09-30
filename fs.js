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
    vec2 p = gl_PointCoord * 2. - 1.;
    float len = length(p);

    float cBlur = blur * 0.5;
    float shape = smoothstep(1. - cBlur, 1. + cBlur, (1. - cBlur) / len);
    
    if (shape == 0.0) discard;  

    out_FragColor = vec4(1.0, 1.0, 0.0, shape);
}`;

export default fs;
