import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

class TVGallery {
  constructor(canvasId, modelPath, mediaSources) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) { console.error('Canvas не найден'); return; }
    this.modelPath = modelPath;
    this.mediaSources = mediaSources;
    this.currentIndex = 0;
    this.screenAspect = 1.333;
    this.fitMode = 'fill';
    this.pixelSize = 5;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.tvModel = null;
    this.screenMaterial = null;
    this.screenMesh = null;
    this.mediaItems = [];
    this.renderTarget = null;
    this.postScene = null;
    this.postCamera = null;
    this.postQuad = null;
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.pointerDownPos = null;
    this.defaultCameraPos = new THREE.Vector3(0, 0, 6.5);

    try {
      this.initThree();
      this.initPostProcessing();
      this.loadModel();
      this.loadMedia();
      this.setupControls();
      this.animate();
    } catch (e) {
      console.error('Ошибка инициализации:', e);
    }
  }

  initThree() {
    const width = this.canvas.clientWidth || 800;
    const height = this.canvas.clientHeight || 560;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 100);
    this.camera.position.set(0, 0, 6.5);
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: true,           
      antialias: false
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(1);
    if ('outputColorSpace' in this.renderer) {
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    } else if ('outputEncoding' in this.renderer) {
      this.renderer.outputEncoding = THREE.sRGBEncoding;
    }
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.shadowMap.enabled = false;

  

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const key = new THREE.DirectionalLight(0xffffff, 1.15);
    key.position.set(4, 6, 7);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xaaccff, 0.55);
    fill.position.set(-5, -1, 4);
    this.scene.add(fill);
    const rim = new THREE.PointLight(0xff00ff, 0.8, 25);
    rim.position.set(-4, 4, -6);
    this.scene.add(rim);
  }

  initPostProcessing() {
    const w = Math.max(2, Math.floor(this.canvas.clientWidth / this.pixelSize));
    const h = Math.max(2, Math.floor(this.canvas.clientHeight / this.pixelSize));
    this.renderTarget = new THREE.WebGLRenderTarget(w, h, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      depthBuffer: true,
      stencilBuffer: false
    });
    this.postScene = new THREE.Scene();
   
    this.postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const quadGeo = new THREE.PlaneGeometry(2, 2);
    const quadMat = new THREE.MeshBasicMaterial({
      map: this.renderTarget.texture,
      depthTest: false,
      depthWrite: false,
      transparent: true         
    });
    this.postQuad = new THREE.Mesh(quadGeo, quadMat);
    this.postScene.add(this.postQuad);
  }

  findScreenMesh() {
    const screenMeshes = [];
    this.tvModel.traverse((node) => {
      if (!node.isMesh || !node.material) return;
      const matName = (node.material.name || '').toLowerCase();
      const nodeName = (node.name || '').toLowerCase();
      if (
        matName.includes('screen') || matName.includes('display') ||
        matName.includes('lcd') || matName.includes('crt') ||
        nodeName.includes('screen') || nodeName.includes('display')
      ) {
        screenMeshes.push(node);
      }
    });
    if (!screenMeshes.length) return null;
    let refMesh = screenMeshes[0];
    let maxArea = 0;
    screenMeshes.forEach(m => {
      m.geometry.computeBoundingBox();
      const b = m.geometry.boundingBox.getSize(new THREE.Vector3());
      const sorted = [b.x, b.y, b.z].sort((a, c) => c - a);
      const area = sorted[0] * sorted[1];
      if (area > maxArea) { maxArea = area; refMesh = m; }
    });
    return refMesh;
  }

  loadModel() {
    const loader = new GLTFLoader();
    loader.load(
      this.modelPath,
      (gltf) => {
        this.tvModel = gltf.scene;
        const box = new THREE.Box3().setFromObject(this.tvModel);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const targetSize = 4.0;
        const scale = targetSize / maxDim;
        this.tvModel.scale.setScalar(scale);
        this.tvModel.position.x = -center.x * scale;
        this.tvModel.position.y = -center.y * scale;
        this.tvModel.position.z = -center.z * scale;
        this.tvModel.traverse((node) => {
          if (node.isMesh) {
            node.castShadow = false;
            node.receiveShadow = false;
          }
        });
        this.tvModel.updateMatrixWorld(true);
        const refMesh = this.findScreenMesh();
        if (refMesh) {
          const sBox = new THREE.Box3().setFromObject(refMesh);
          const sCenter = sBox.getCenter(new THREE.Vector3());
          const angleToScreen = Math.atan2(sCenter.x, sCenter.z);
          this.tvModel.rotation.y = -angleToScreen;
        }
        this.tvModel.rotation.x = -0.02;
        this.tvModel.updateMatrixWorld(true);
        if (!this.convertScreenToVideo()) {
          this.createFallbackScreen();
        }
        this.updateScreen();
        this.scene.add(this.tvModel);
        this.fitCamera();
      },
      undefined,
      (err) => {
        console.error('Не удалось загрузить модель:', err);
        this.createFallbackBody();
      }
    );
  }

  fitCamera() {
    if (!this.tvModel) return;
    this.tvModel.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this.tvModel);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const radius = sphere.radius;
    const aspect = this.canvas.clientWidth / this.canvas.clientHeight;
    const fov = this.camera.fov * Math.PI / 180;
    const distV = radius / Math.tan(fov / 2);
    const distH = radius / (Math.tan(fov / 2) * aspect);
    const dist = Math.max(distV, distH) * 0.97;

    this.defaultCameraPos.set(0, 0, dist);
    this.camera.position.copy(this.defaultCameraPos);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateProjectionMatrix();
    if (this.controls) {
      this.controls.target.set(0, 0, 0);
      this.controls.update();
    }
  }

  convertScreenToVideo() {
    const tvModel = this.tvModel;
    if (!tvModel) return false;
    tvModel.updateMatrixWorld(true);
    const refMesh = this.screenMesh || this.findScreenMesh();
    if (!refMesh) {
      return false;
    }
    const uv = refMesh.geometry.attributes.uv;
    if (uv) {
      let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
      for (let i = 0; i < uv.count; i++) {
        const u = uv.getX(i), v = uv.getY(i);
        if (u < minU) minU = u;
        if (u > maxU) maxU = u;
        if (v < minV) minV = v;
        if (v > maxV) maxV = v;
      }
      const rU = (maxU - minU) || 1;
      const rV = (maxV - minV) || 1;
      for (let i = 0; i < uv.count; i++) {
        uv.setXY(i, (uv.getX(i) - minU) / rU, (uv.getY(i) - minV) / rV);
      }
      uv.needsUpdate = true;
    }
    this.resizeAllCanvases();
    this.screenMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      toneMapped: false,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false
    });
    refMesh.material = this.screenMaterial;
    refMesh.renderOrder = 999;
    this.screenMesh = refMesh;
    refMesh.layers.set(1);
    tvModel.traverse((node) => {
      if (!node.isMesh || node === refMesh) return;
      if (!node.material) return;
      const matName = (node.material.name || '').toLowerCase();
      const nodeName = (node.name || '').toLowerCase();
      if (
        matName.includes('screen') || matName.includes('display') ||
        matName.includes('lcd') || matName.includes('crt') ||
        nodeName.includes('screen') || nodeName.includes('display')
      ) {
        node.visible = false;
      }
    });
    return true;
  }

  createFallbackScreen() {
    const geo = new THREE.PlaneGeometry(1.6, 1.2);
    this.screenMaterial = new THREE.MeshBasicMaterial({
      color: 0x1a3a1a,
      depthTest: false,
      depthWrite: false
    });
    this.screenMesh = new THREE.Mesh(geo, this.screenMaterial);
    this.screenMesh.position.set(0, 0, 0.3);
    this.screenMesh.renderOrder = 999;
    this.screenMesh.layers.set(1);
    if (this.tvModel) this.tvModel.add(this.screenMesh);
    this.resizeAllCanvases();
  }

  createFallbackBody() {
    const geo = new THREE.BoxGeometry(3.2, 2.4, 1.6);
    const mat = new THREE.MeshStandardMaterial({ color: 0x8b1a1a, roughness: 0.6 });
    this.tvModel = new THREE.Mesh(geo, mat);
    this.scene.add(this.tvModel);
    this.createFallbackScreen();
  }

  loadMedia() {
    this.mediaSources.forEach((src, index) => {
      const video = document.createElement('video');
      video.src = src;
      video.loop = true;
      video.muted = true;
      video.playsInline = true;
      video.autoplay = true;
      video.crossOrigin = 'anonymous';
      video.preload = 'auto';
      const canvas = document.createElement('canvas');
      canvas.width = 1024;
      canvas.height = 768;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const texture = new THREE.CanvasTexture(canvas);
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.flipY = false;
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      const item = {
        video: video,
        canvas: canvas,
        ctx: ctx,
        texture: texture,
        loaded: false
      };
      video.addEventListener('loadeddata', () => {
        item.loaded = true;
        this.resizeCanvas(item);
        this.drawVideoToCanvas(item);
        video.play().catch(e => console.warn('Play failed:', e));
        if (index === 0) this.updateScreen();
      });
      video.addEventListener('error', () => {
        console.warn('Не удалось загрузить видео:', src);
      });
      this.mediaItems.push(item);
    });
  }

  resizeAllCanvases() {
    this.mediaItems.forEach(item => this.resizeCanvas(item));
  }

  resizeCanvas(item) {
    const aspect = this.screenAspect || 1.333;
    let w = 1024;
    let h = Math.round(w / aspect);
    if (h > 1024) { h = 1024; w = Math.round(h * aspect); }
    w -= w % 2;
    h -= h % 2;
    if (w < 256) w = 256;
    if (h < 256) h = 256;
    item.canvas.width = w;
    item.canvas.height = h;
    item.ctx = item.canvas.getContext('2d', { willReadFrequently: true });
    item.texture.needsUpdate = true;
  }

  drawVideoToCanvas(item) {
    if (!item.loaded) return;
    const vW = item.video.videoWidth;
    const vH = item.video.videoHeight;
    if (!vW || !vH) return;
    const cW = item.canvas.width;
    const cH = item.canvas.height;
    const videoAspect = vW / vH;
    const canvasAspect = cW / cH;
    let dw, dh, dx, dy;
    if (this.fitMode === 'fill') {
      dw = cW; dh = cH; dx = 0; dy = 0;
    } else if (this.fitMode === 'cover') {
      if (videoAspect > canvasAspect) {
        dh = cH; dw = cH * videoAspect; dx = (cW - dw) / 2; dy = 0;
      } else {
        dw = cW; dh = cW / videoAspect; dx = 0; dy = (cH - dh) / 2;
      }
    } else {
      if (videoAspect > canvasAspect) {
        dw = cW; dh = cW / videoAspect; dx = 0; dy = (cH - dh) / 2;
      } else {
        dh = cH; dw = cH * videoAspect; dx = (cW - dw) / 2; dy = 0;
      }
    }
    item.ctx.fillStyle = '#000';
    item.ctx.fillRect(0, 0, cW, cH);
    item.ctx.imageSmoothingEnabled = true;
    item.ctx.imageSmoothingQuality = 'high';
    item.ctx.drawImage(item.video, dx, dy, dw, dh);
    item.texture.needsUpdate = true;
  }

  updateScreen() {
    if (!this.screenMaterial) return;
    const item = this.mediaItems[this.currentIndex];
    if (item && item.loaded) {
      this.screenMaterial.map = item.texture;
      this.screenMaterial.color.setHex(0xffffff);
    } else {
      this.screenMaterial.map = null;
      this.screenMaterial.color.setHex(0x1a3a1a);
    }
    this.screenMaterial.needsUpdate = true;
    this.mediaItems.forEach((it, i) => {
      if (!it.video) return;
      if (i === this.currentIndex) it.video.play().catch(() => {});
      else it.video.pause();
    });
  }

  setupControls() {
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enableZoom = false;
    this.controls.enablePan = false;

    this._onKey = (e) => {
      if (e.key === 'ArrowRight') this.next();
      if (e.key === 'ArrowLeft') this.prev();
    };
    document.addEventListener('keydown', this._onKey);

    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', (e) => {
      this.pointerDownPos = { x: e.clientX, y: e.clientY };
    });

    el.addEventListener('pointerup', (e) => {
      if (!this.pointerDownPos) return;
      const dx = Math.abs(e.clientX - this.pointerDownPos.x);
      const dy = Math.abs(e.clientY - this.pointerDownPos.y);
      this.pointerDownPos = null;
      if (dx > 6 || dy > 6) return;
      this.handleClick(e.clientX, e.clientY);
    });

    window.addEventListener('resize', () => this.onResize());
  }

  handleClick(clientX, clientY) {
    if (!this.tvModel) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.camera);
    this.raycaster.layers.enableAll();
    const modelHits = this.raycaster.intersectObject(this.tvModel, true);
    if (modelHits.length > 0) {
      this.next();
    }
  }

  onResize() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    if (this.renderTarget) {
      const rw = Math.max(2, Math.floor(w / this.pixelSize));
      const rh = Math.max(2, Math.floor(h / this.pixelSize));
      this.renderTarget.setSize(rw, rh);
    }
    this.fitCamera();
  }

  next() {
    if (!this.mediaItems.length) return;
    this.currentIndex = (this.currentIndex + 1) % this.mediaItems.length;
    this.updateScreen();
  }

  prev() {
    if (!this.mediaItems.length) return;
    this.currentIndex = (this.currentIndex - 1 + this.mediaItems.length) % this.mediaItems.length;
    this.updateScreen();
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    const item = this.mediaItems[this.currentIndex];
    if (item && item.loaded) this.drawVideoToCanvas(item);

    if (this.controls) this.controls.update();

    this.camera.layers.set(0);
    this.renderer.setRenderTarget(this.renderTarget);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
    this.renderer.clear();
    this.renderer.render(this.postScene, this.postCamera);
    this.camera.layers.set(1);
    this.renderer.autoClear = false;
    this.renderer.render(this.scene, this.camera);
    this.renderer.autoClear = true;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new TVGallery(
    'phoneCanvas',
    'assets/tv.glb',
    [
      'assets/motion1.mp4',
      'assets/motion2.mp4',
      'assets/motion3.mp4',
      'assets/motion4.mp4',
      'assets/motion5.mp4',
      'assets/motion6.mp4'
    ]
  );
});