import { useEffect, useRef, useState } from 'react'
import { clusterPosts } from '../../lib/mapClusters'
import { createMapDriver, prepareMapSdk, type MapDriver } from '../../lib/webMaps/mapDriver'
import { isValidLocation, type LatLng } from '../../lib/mapLocation'
import type { PinTheme, Post } from '../../types/post'
import { createPostMarkerContent } from './PostMarker'

interface MapViewProps {
  center: LatLng
  // Bump to pan back to `center` even when its coordinates did not change.
  centerRevision?: number
  posts: Post[]
  currentLocation?: LatLng | null
  selectedLocation?: LatLng | null
  selectedPhotoUrl?: string
  selectedPostId?: string
  onMapClick: (location: LatLng) => void
  onMarkerClick: (post: Post) => void
  onClusterClick?: (posts: Post[]) => void
  onCenterIdle?: (center: LatLng) => void
  currentUserUid?: string
  pinThemes?: PinTheme[]
  className?: string
}

export function MapView({
  center, centerRevision = 0, posts, currentLocation = null, selectedLocation = null, selectedPhotoUrl, selectedPostId,
  onMapClick, onMarkerClick, onClusterClick, onCenterIdle, currentUserUid, pinThemes, className = '',
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const driverRef = useRef<MapDriver | null>(null)
  const latestRef = useRef({ center, onMapClick, onMarkerClick, onClusterClick, onCenterIdle })
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [message, setMessage] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    latestRef.current = { center, onMapClick, onMarkerClick, onClusterClick, onCenterIdle }
  }, [center, onMapClick, onMarkerClick, onClusterClick, onCenterIdle])

  useEffect(() => {
    let canceled = false
    let driver: MapDriver | undefined
    let observer: ResizeObserver | undefined
    setStatus('loading')
    setMessage('')
    prepareMapSdk().then(() => {
      if (canceled || !containerRef.current) return
      driver = createMapDriver(containerRef.current, latestRef.current.center,
        (location) => latestRef.current.onMapClick(location))
      driverRef.current = driver
      observer = new ResizeObserver(() => driver?.resize())
      observer.observe(containerRef.current)
      setStatus('ready')
    }).catch((error: unknown) => {
      if (canceled) return
      setStatus('error')
      setMessage(error instanceof Error ? error.message : '지도를 불러오지 못했습니다.')
    })
    return () => {
      canceled = true
      observer?.disconnect()
      driver?.destroy()
      driverRef.current = null
    }
  }, [attempt])

  useEffect(() => {
    const location = { lat: center.lat, lng: center.lng }
    if (status === 'ready' && isValidLocation(location)) driverRef.current?.setCenter(location)
  }, [center.lat, center.lng, centerRevision, status])

  useEffect(() => {
    const driver = driverRef.current
    if (status !== 'ready' || !driver) return
    let removeMarkers: (() => void)[] = []
    function renderMarkers() {
      removeMarkers.forEach((remove) => remove())
      removeMarkers = clusterPosts(posts, driver!.project).map((cluster) => {
        const content = createPostMarkerContent(cluster.posts, currentUserUid, selectedPostId, () => {
          if (cluster.posts.length > 1 && latestRef.current.onClusterClick) {
            latestRef.current.onClusterClick(cluster.posts)
          } else latestRef.current.onMarkerClick(cluster.posts[0])
        }, driver!.preventMapClick, pinThemes)
        const selectedPost = cluster.posts.find((post) => post.id === selectedPostId)
        return driver!.addMarker(selectedPost || cluster.location, content, Boolean(selectedPost))
      })
    }
    renderMarkers()
    const unsubscribe = driver.onIdle(renderMarkers)
    return () => {
      unsubscribe()
      removeMarkers.forEach((remove) => remove())
    }
  }, [posts, currentUserUid, selectedPostId, pinThemes, status])

  useEffect(() => {
    const driver = driverRef.current
    if (status !== 'ready' || !driver) return
    return driver.onIdle(() => latestRef.current.onCenterIdle?.(driver.getCenter()))
  }, [status])

  useEffect(() => {
    const driver = driverRef.current
    if (status !== 'ready' || !driver || !selectedLocation || !isValidLocation(selectedLocation)) return
    const content = document.createElement('div')
    content.className = selectedPhotoUrl ? 'map-photo-pin' : 'map-location-pin'
    content.setAttribute('role', 'img')
    content.setAttribute('aria-label', selectedPhotoUrl ? '사진을 찍은 위치' : '새 기록을 남길 위치')
    if (selectedPhotoUrl) {
      const photo = document.createElement('img')
      photo.src = selectedPhotoUrl
      photo.alt = ''
      content.appendChild(photo)
    }
    return driver.addMarker(selectedLocation, content, true)
  }, [selectedLocation, selectedPhotoUrl, status])

  useEffect(() => {
    const driver = driverRef.current
    if (status !== 'ready' || !driver || !currentLocation || !isValidLocation(currentLocation)) return
    const content = document.createElement('div')
    content.className = 'map-current-location'
    content.setAttribute('role', 'img')
    content.setAttribute('aria-label', '내 현재 위치')
    content.title = '내 현재 위치'
    return driver.addMarker(currentLocation, content, true)
  }, [currentLocation, status])

  return (
    <section className={`location-map ${className}`} aria-label="장소 기록 지도" data-map-provider="google">
      <div ref={containerRef} className="map-canvas" />
      {status !== 'ready' && (
        <div className="map-state" role="status">
          <strong>{status === 'loading' ? '지도를 불러오는 중입니다.' : '지도를 표시할 수 없습니다.'}</strong>
          {message && <p>{message}</p>}
          {status === 'error' && <button type="button" className="button button-secondary" onClick={() => setAttempt((value) => value + 1)}>다시 시도</button>}
        </div>
      )}
    </section>
  )
}
