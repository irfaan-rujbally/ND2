import { useEffect, useRef, useState } from 'react'

/**
 * Decorative particle field in the party's blue and red, used behind the login
 * card and the dashboard header.
 *
 * It is deliberately cheap and deliberately optional:
 *  - skipped entirely below `minWidth` (default 768px) to spare phone batteries
 *  - skipped when the OS asks for reduced motion
 *  - skipped if WebGL is unavailable
 *  - paused while the tab is hidden
 *
 * three.js is imported dynamically, so a phone or a reduced-motion visitor
 * never downloads the ~600 kB library at all. When skipped, nothing renders and
 * the parent's own background shows through, so every screen stays fully usable.
 */
export function ThreeBackground({ className = '', density = 1, minWidth = 768 }) {
  const containerRef = useRef(null)
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const decide = () => setEnabled(window.innerWidth >= minWidth && !reduceMotion.matches)

    decide()
    window.addEventListener('resize', decide)
    reduceMotion.addEventListener('change', decide)

    return () => {
      window.removeEventListener('resize', decide)
      reduceMotion.removeEventListener('change', decide)
    }
  }, [minWidth])

  useEffect(() => {
    if (!enabled || !containerRef.current) return

    const container = containerRef.current
    let disposed = false
    let cleanup = () => {}

    import('three')
      .then((THREE) => {
        if (disposed) return

        let renderer
        try {
          renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' })
        } catch {
          return // No WebGL: leave the plain background in place.
        }

        const scene = new THREE.Scene()
        const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100)
        camera.position.z = 26

        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
        renderer.setClearColor(0x000000, 0)
        renderer.domElement.style.display = 'block'
        container.appendChild(renderer.domElement)

        const count = Math.round(900 * density)
        const positions = new Float32Array(count * 3)
        const colors = new Float32Array(count * 3)

        const blue = new THREE.Color('#3b53d6')
        const red = new THREE.Color('#d0021b')
        const mix = new THREE.Color()

        for (let i = 0; i < count; i += 1) {
          positions[i * 3] = (Math.random() - 0.5) * 70
          positions[i * 3 + 1] = (Math.random() - 0.5) * 42
          positions[i * 3 + 2] = (Math.random() - 0.5) * 34

          // Bias towards blue so the red reads as an accent, not a co-lead.
          mix.copy(blue).lerp(red, Math.pow(Math.random(), 2.2))
          colors[i * 3] = mix.r
          colors[i * 3 + 1] = mix.g
          colors[i * 3 + 2] = mix.b
        }

        const geometry = new THREE.BufferGeometry()
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))

        // Without a texture, PointsMaterial draws hard squares. A small radial
        // gradient turns each particle into a soft dot instead.
        const sprite = document.createElement('canvas')
        sprite.width = 64
        sprite.height = 64
        const ctx = sprite.getContext('2d')
        const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
        gradient.addColorStop(0, 'rgba(255,255,255,1)')
        gradient.addColorStop(0.35, 'rgba(255,255,255,0.65)')
        gradient.addColorStop(1, 'rgba(255,255,255,0)')
        ctx.fillStyle = gradient
        ctx.fillRect(0, 0, 64, 64)

        const spriteTexture = new THREE.CanvasTexture(sprite)

        const material = new THREE.PointsMaterial({
          size: 0.5,
          map: spriteTexture,
          vertexColors: true,
          transparent: true,
          opacity: 0.9,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        })

        const points = new THREE.Points(geometry, material)
        scene.add(points)

        const pointer = { x: 0, y: 0 }
        const onPointerMove = (event) => {
          pointer.x = (event.clientX / window.innerWidth - 0.5) * 2
          pointer.y = (event.clientY / window.innerHeight - 0.5) * 2
        }
        window.addEventListener('pointermove', onPointerMove, { passive: true })

        const resize = () => {
          const { clientWidth, clientHeight } = container
          if (!clientWidth || !clientHeight) return
          renderer.setSize(clientWidth, clientHeight, false)
          camera.aspect = clientWidth / clientHeight
          camera.updateProjectionMatrix()
        }
        resize()

        const observer = new ResizeObserver(resize)
        observer.observe(container)

        let frame
        let running = true
        const start = performance.now()

        const tick = () => {
          if (!running) return
          const elapsed = (performance.now() - start) / 1000

          points.rotation.y = elapsed * 0.035
          points.rotation.x = Math.sin(elapsed * 0.12) * 0.06

          // Ease the camera towards the pointer for a subtle parallax.
          camera.position.x += (pointer.x * 2.4 - camera.position.x) * 0.03
          camera.position.y += (-pointer.y * 1.6 - camera.position.y) * 0.03
          camera.lookAt(0, 0, 0)

          renderer.render(scene, camera)
          frame = requestAnimationFrame(tick)
        }
        tick()

        const onVisibility = () => {
          if (document.hidden) {
            running = false
            cancelAnimationFrame(frame)
          } else if (!running) {
            running = true
            tick()
          }
        }
        document.addEventListener('visibilitychange', onVisibility)

        cleanup = () => {
          running = false
          cancelAnimationFrame(frame)
          document.removeEventListener('visibilitychange', onVisibility)
          window.removeEventListener('pointermove', onPointerMove)
          observer.disconnect()
          geometry.dispose()
          material.dispose()
          spriteTexture.dispose()
          renderer.dispose()
          if (renderer.domElement.parentNode === container) {
            container.removeChild(renderer.domElement)
          }
        }
      })
      .catch(() => {
        // three.js failed to load; the static background is enough.
      })

    return () => {
      disposed = true
      cleanup()
    }
  }, [enabled, density])

  if (!enabled) return null

  return <div ref={containerRef} aria-hidden="true" className={className} />
}
