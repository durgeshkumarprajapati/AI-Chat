'use client';

import React, { useEffect, useRef, useState } from 'react';

interface ChillFocusShellProps {
  children: React.ReactNode;
  mode?: 'CHILL' | 'FOCUS';
  reducedMotion?: boolean;
}

export const ChillFocusShell: React.FC<ChillFocusShellProps> = ({
  children,
  mode = 'CHILL',
  reducedMotion = false
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isLowPower, setIsLowPower] = useState(false);

  useEffect(() => {
    // Check user preference for reduced motion
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (motionQuery.matches) {
      setIsLowPower(true);
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas || reducedMotion) return;

    let animFrameId: number;
    let gl: WebGLRenderingContext | null = null;

    try {
      gl = canvas.getContext('webgl') || (canvas.getContext('experimental-webgl') as WebGLRenderingContext | null);
    } catch {
      setIsLowPower(true);
      return;
    }

    if (!gl) {
      setIsLowPower(true);
      return;
    }

    // Vertex Shader
    const vsSource = `
      attribute vec2 position;
      void main() {
        gl_Position = vec4(position, 0.0, 1.0);
      }
    `;

    // Fragment Shader - Deep Blue Ambient Waves
    const fsSource = `
      precision mediump float;
      uniform vec2 u_resolution;
      uniform float u_time;
      uniform float u_mode;

      void main() {
        vec2 st = gl_FragCoord.xy / u_resolution.xy;
        st.x *= u_resolution.x / u_resolution.y;

        float t = u_time * (u_mode > 0.5 ? 0.08 : 0.15);
        vec2 pos = st * 2.0;

        float wave1 = sin(pos.x * 2.0 + t + sin(pos.y * 3.0 + t));
        float wave2 = cos(pos.y * 2.5 - t * 0.8 + cos(pos.x * 1.8 + t));
        float combined = (wave1 + wave2) * 0.5;

        vec3 baseBlue = vec3(0.02, 0.08, 0.22);
        vec3 chillGlow = vec3(0.08, 0.32, 0.58);
        vec3 focusGlow = vec3(0.05, 0.20, 0.45);
        vec3 targetGlow = mix(chillGlow, focusGlow, u_mode);

        vec3 color = mix(baseBlue, targetGlow, combined * 0.4 + 0.4);
        gl_FragColor = vec4(color, 1.0);
      }
    `;

    const createShader = (glCtx: WebGLRenderingContext, type: number, source: string) => {
      const shader = glCtx.createShader(type);
      if (!shader) return null;
      glCtx.shaderSource(shader, source);
      glCtx.compileShader(shader);
      if (!glCtx.getShaderParameter(shader, glCtx.COMPILE_STATUS)) {
        glCtx.deleteShader(shader);
        return null;
      }
      return shader;
    };

    const vertShader = createShader(gl, gl.VERTEX_SHADER, vsSource);
    const fragShader = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
    if (!vertShader || !fragShader) {
      setIsLowPower(true);
      return;
    }

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vertShader);
    gl.attachShader(program, fragShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      setIsLowPower(true);
      return;
    }

    gl.useProgram(program);

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );

    const positionLocation = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    const resLoc = gl.getUniformLocation(program, 'u_resolution');
    const timeLoc = gl.getUniformLocation(program, 'u_time');
    const modeLoc = gl.getUniformLocation(program, 'u_mode');

    const resize = () => {
      if (!canvas || !gl) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      gl.viewport(0, 0, canvas.width, canvas.height);
    };

    resize();
    window.addEventListener('resize', resize);

    const startTime = performance.now();

    const render = () => {
      // Pause animation if tab is hidden (document.hidden) to conserve GPU/battery
      if (!document.hidden && gl && program) {
        const now = (performance.now() - startTime) / 1000;
        gl.uniform2f(resLoc, canvas.width, canvas.height);
        gl.uniform1f(timeLoc, now);
        gl.uniform1f(modeLoc, mode === 'FOCUS' ? 1.0 : 0.0);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }
      animFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animFrameId);
      if (gl && program) {
        gl.deleteProgram(program);
      }
    };
  }, [mode, reducedMotion]);

  return (
    <div className="relative min-h-dvh w-full bg-slate-950 overflow-x-hidden font-sans text-slate-100 flex flex-col justify-between select-none">
      {/* WebGL Canvas or CSS Background Fallback */}
      {!isLowPower && !reducedMotion ? (
        <canvas
          ref={canvasRef}
          className="fixed inset-0 w-full h-full pointer-events-none z-0 opacity-90 transition-opacity duration-1000"
        />
      ) : (
        <div
          className={`fixed inset-0 w-full h-full pointer-events-none z-0 transition-colors duration-1000 ${
            mode === 'FOCUS'
              ? 'bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950'
              : 'bg-gradient-to-br from-slate-950 via-sky-950/40 to-slate-950'
          }`}
        />
      )}

      {/* Main Content Overlay */}
      <div className="relative z-10 flex flex-col min-h-screen w-full">
        {children}
      </div>
    </div>
  );
};
