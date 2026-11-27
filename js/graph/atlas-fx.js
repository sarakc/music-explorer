// The visualizer's effects layer: a WebGL canvas behind the graph's own. Each frame it
// takes a picture of the rest of the map (everything outside the selection's network) and
// draws the ground with it: Wash, Warp, Mirror, and Trails, which feeds the last frame back
// in. `ok` is false without WebGL; the mode then draws the rest of the map plainly.
// Spec: docs/specs/2026-11-22-graph-visualizer-design.md.

const VERT = 'attribute vec2 p; varying vec2 vUv; void main(){ vUv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }';
const FRAG = `
precision highp float;
uniform sampler2D uRest, uPrev;
uniform vec2 uRes;
uniform vec3 uGround;
uniform float uTime, uPulse, uAmt, uWash, uWarp, uTrails, uMirror, uHue;
varying vec2 vUv;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ v += a * noise(p); p = p * 2.03 + 11.7; a *= 0.5; } return v; }
vec3 pal(float t){ return 0.5 + 0.5 * cos(6.28318 * (t + vec3(0.0, 0.33, 0.67))); }
void main(){
  float asp = uRes.x / uRes.y;
  vec2 p = (vUv - 0.5) * vec2(asp, 1.0);
  // Mirror: the ground and the rest of the map folded six ways about the middle.
  if (uMirror > 0.5) {
    float seg = 6.28318 / 6.0, r = length(p), a = atan(p.y, p.x) + uTime * 0.02;
    a = abs(mod(a, seg) - seg * 0.5);
    p = r * vec2(cos(a), sin(a));
  }
  // Warp: the rest of the map wobbles.
  vec2 q = p;
  if (uWarp > 0.5) {
    float w = uAmt * (0.05 + 0.03 * uPulse);
    q += w * (vec2(fbm(p * 2.4 + uTime * 0.11), fbm(p * 2.4 + 7.3 - uTime * 0.09)) - 0.5) * 2.0;
  }
  // Wash: slow liquid colour on the ground, round the hue the camera heads for.
  vec3 col = uGround;
  if (uWash > 0.5) {
    float f = fbm(q * 1.4 + vec2(uTime * 0.05, -uTime * 0.04) + 1.5 * fbm(q * 2.2 - uTime * 0.06));
    vec3 c = pal(uHue + 0.4 * f + 0.01 * uTime);
    col = mix(col, c, uAmt * (0.1 + 0.55 * f * f) * (0.8 + 0.3 * uPulse));
  }
  vec4 dots = texture2D(uRest, q / vec2(asp, 1.0) + 0.5);
  col = col * (1.0 - dots.a) + dots.rgb;
  // Trails: the last frame, a little larger, turned and hue-shifted, fading.
  if (uTrails > 0.5) {
    vec2 c = vUv - 0.5;
    float ang = 0.004 * uAmt, s = 1.0 - 0.012 * uAmt * (1.0 + uPulse);
    c = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * c * s;
    vec3 prev = texture2D(uPrev, c + 0.5).rgb;
    prev = mix(prev, prev.gbr, 0.07 * uAmt) * (0.9 + 0.075 * uAmt);
    col = max(col, prev);
  }
  gl_FragColor = vec4(col, 1.0);
}`;
const COPY = 'precision mediump float; uniform sampler2D uTex; varying vec2 vUv; void main(){ gl_FragColor = texture2D(uTex, vUv); }';
const UNIFORMS = ['uRest', 'uPrev', 'uRes', 'uGround', 'uTime', 'uPulse', 'uAmt', 'uWash', 'uWarp', 'uTrails', 'uMirror', 'uHue'];

export default class AtlasFx {
    constructor(canvas) {
        this.canvas = canvas; this.ok = false; this.targets = [];
        let gl = null;
        try { gl = canvas.getContext('webgl', { antialias: false, alpha: false }); } catch (_) { gl = null; }
        if (!gl) return;
        this.gl = gl;
        try {
            this.prog = this._program(FRAG); this.copy = this._program(COPY);
        } catch (_) { return; }
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        this.u = Object.fromEntries(UNIFORMS.map((name) => [name, gl.getUniformLocation(this.prog, name)]));
        this.uTex = gl.getUniformLocation(this.copy, 'uTex');
        this.restTex = this._texture();
        this.ok = true;
        // A lost context (the tab slept, the GPU reset) leaves the mode running without effects.
        this._lost = () => { this.ok = false; };
        canvas.addEventListener('webglcontextlost', this._lost);
    }

    _program(fragSrc) {
        const gl = this.gl;
        const make = (type, src) => {
            const s = gl.createShader(type);
            gl.shaderSource(s, src); gl.compileShader(s);
            if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader');
            return s;
        };
        const pr = gl.createProgram();
        gl.attachShader(pr, make(gl.VERTEX_SHADER, VERT)); gl.attachShader(pr, make(gl.FRAGMENT_SHADER, fragSrc));
        gl.bindAttribLocation(pr, 0, 'p'); gl.linkProgram(pr);
        if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr) || 'link');
        return pr;
    }

    _texture() {
        const gl = this.gl, t = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return t;
    }

    /** The layer's size in pixels; the fed-back frames start again from the ground. */
    resize(width, height, ground = [22, 23, 27]) {
        width = Math.max(1, Math.round(width)); height = Math.max(1, Math.round(height));
        if (this.canvas.width === width && this.canvas.height === height && this.targets.length) return;
        this.canvas.width = width; this.canvas.height = height;
        if (!this.ok) return;
        const gl = this.gl;
        for (const t of this.targets) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fb); }
        this.targets = [0, 1].map(() => {
            const tex = this._texture();
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
            const fb = gl.createFramebuffer();
            gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
            gl.clearColor(ground[0] / 255, ground[1] / 255, ground[2] / 255, 1); gl.clear(gl.COLOR_BUFFER_BIT);
            return { tex, fb };
        });
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    /**
     * One frame. `rest` is a canvas the size of this one holding the rest of the map on a
     * clear ground; `time` seconds, `pulse` the beat (0 to 1), `amount` the intensity (0 to
     * 1), `hue` Wash's tint (0 to 1), `ground` the ground's rgb (0 to 255).
     */
    draw({ rest, time = 0, pulse = 0, amount = 0, hue = 0, wash = false, warp = false, trails = false, mirror = false, ground = [22, 23, 27] }) {
        if (!this.ok || this.targets.length < 2) return;
        const gl = this.gl, u = this.u, [dst, src] = this.targets, { width, height } = this.canvas;
        gl.viewport(0, 0, width, height);
        gl.useProgram(this.prog);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.restTex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, rest);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, src.tex);
        gl.uniform1i(u.uRest, 0); gl.uniform1i(u.uPrev, 1);
        gl.uniform2f(u.uRes, width, height);
        gl.uniform3f(u.uGround, ground[0] / 255, ground[1] / 255, ground[2] / 255);
        gl.uniform1f(u.uTime, time); gl.uniform1f(u.uPulse, pulse); gl.uniform1f(u.uAmt, amount); gl.uniform1f(u.uHue, hue);
        gl.uniform1f(u.uWash, wash ? 1 : 0); gl.uniform1f(u.uWarp, warp ? 1 : 0); gl.uniform1f(u.uTrails, trails ? 1 : 0); gl.uniform1f(u.uMirror, mirror ? 1 : 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fb);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.useProgram(this.copy);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, dst.tex);
        gl.uniform1i(this.uTex, 0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        this.targets.reverse();
    }

    destroy() {
        if (this._lost) this.canvas.removeEventListener('webglcontextlost', this._lost);
        this.ok = false;
        try { this.gl?.getExtension('WEBGL_lose_context')?.loseContext(); } catch (_) { /* already gone */ }
        this.gl = null; this.targets = [];
    }
}
