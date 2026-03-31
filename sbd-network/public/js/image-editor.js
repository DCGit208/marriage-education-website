// ================================================================
// BASIC IMAGE EDITOR
// Canvas-based image editing: Crop, Rotate, Brightness
// ================================================================

class ImageEditor {
  constructor() {
    this.modal = null;
    this.canvas = null;
    this.ctx = null;
    this.image = null;
    this.originalImage = null;
    this.rotation = 0;
    this.brightness = 100;
    this.cropData = { x: 0, y: 0, width: 0, height: 0 };
    this.isDragging = false;
    this.dragStart = { x: 0, y: 0 };
    this.scale = 1;
    this.resolveCallback = null;
  }

  // Open editor with an image file
  open(file) {
    return new Promise((resolve) => {
      if (!file || !file.type.startsWith('image/')) {
        resolve(null);
        return;
      }

      this.resolveCallback = resolve;
      this.createModal();
      this.loadImage(file);
    });
  }

  // Create the editor modal
  createModal() {
    if (this.modal) {
      this.modal.style.display = 'flex';
      return;
    }

    this.modal = document.createElement('div');
    this.modal.className = 'image-editor-modal';
    this.modal.innerHTML = `
      <div class="image-editor-container">
        <div class="image-editor-header">
          <h3>Edit Image</h3>
          <button class="image-editor-close" aria-label="Close">✕</button>
        </div>
        
        <div class="image-editor-canvas-wrapper">
          <canvas class="image-editor-canvas"></canvas>
        </div>
        
        <div class="image-editor-controls">
          <div class="control-group">
            <label>Rotate</label>
            <div class="control-buttons">
              <button class="control-btn" data-action="rotate-left" title="Rotate left">↺</button>
              <button class="control-btn" data-action="rotate-right" title="Rotate right">↻</button>
            </div>
          </div>
          
          <div class="control-group">
            <label>Brightness</label>
            <input 
              type="range" 
              class="brightness-slider" 
              min="50" 
              max="150" 
              value="100" 
              step="5"
            >
            <span class="brightness-value">100%</span>
          </div>
          
          <div class="control-group">
            <label>Crop</label>
            <div class="control-buttons">
              <button class="control-btn" data-action="crop-square" title="Square crop">▢</button>
              <button class="control-btn" data-action="crop-reset" title="Reset crop">Reset</button>
            </div>
          </div>
        </div>
        
        <div class="image-editor-footer">
          <button class="btn-cancel">Cancel</button>
          <button class="btn-save">Save</button>
        </div>
      </div>
    `;

    document.body.appendChild(this.modal);

    // Get elements
    this.canvas = this.modal.querySelector('.image-editor-canvas');
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });

    // Event listeners
    this.modal.querySelector('.image-editor-close').addEventListener('click', () => this.close(null));
    this.modal.querySelector('.btn-cancel').addEventListener('click', () => this.close(null));
    this.modal.querySelector('.btn-save').addEventListener('click', () => this.save());

    // Rotation controls
    this.modal.querySelector('[data-action="rotate-left"]').addEventListener('click', () => {
      this.rotation -= 90;
      this.render();
    });

    this.modal.querySelector('[data-action="rotate-right"]').addEventListener('click', () => {
      this.rotation += 90;
      this.render();
    });

    // Brightness slider
    const brightnessSlider = this.modal.querySelector('.brightness-slider');
    const brightnessValue = this.modal.querySelector('.brightness-value');
    brightnessSlider.addEventListener('input', (e) => {
      this.brightness = parseInt(e.target.value);
      brightnessValue.textContent = this.brightness + '%';
      this.render();
    });

    // Crop controls
    this.modal.querySelector('[data-action="crop-square"]').addEventListener('click', () => {
      this.applyCropSquare();
    });

    this.modal.querySelector('[data-action="crop-reset"]').addEventListener('click', () => {
      this.resetCrop();
    });

    // Canvas drag for crop
    this.canvas.addEventListener('mousedown', (e) => this.startDrag(e));
    this.canvas.addEventListener('mousemove', (e) => this.drag(e));
    this.canvas.addEventListener('mouseup', () => this.endDrag());
    this.canvas.addEventListener('mouseleave', () => this.endDrag());

    // Touch events for mobile
    this.canvas.addEventListener('touchstart', (e) => this.startDrag(e.touches[0]));
    this.canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      this.drag(e.touches[0]);
    });
    this.canvas.addEventListener('touchend', () => this.endDrag());
  }

  // Load image from file
  loadImage(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        this.originalImage = img;
        this.image = img;
        this.rotation = 0;
        this.brightness = 100;
        this.resetCrop();
        this.fitCanvas();
        this.render();
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  // Fit canvas to image size
  fitCanvas() {
    const maxWidth = Math.min(window.innerWidth - 40, 600);
    const maxHeight = Math.min(window.innerHeight - 300, 400);
    
    let width = this.image.width;
    let height = this.image.height;
    
    // Calculate scale to fit
    const widthRatio = maxWidth / width;
    const heightRatio = maxHeight / height;
    this.scale = Math.min(widthRatio, heightRatio, 1);
    
    this.canvas.width = width * this.scale;
    this.canvas.height = height * this.scale;
    
    this.resetCrop();
  }

  // Reset crop to full image
  resetCrop() {
    this.cropData = {
      x: 0,
      y: 0,
      width: this.image.width,
      height: this.image.height
    };
    this.render();
  }

  // Apply square crop to center
  applyCropSquare() {
    const size = Math.min(this.image.width, this.image.height);
    this.cropData = {
      x: (this.image.width - size) / 2,
      y: (this.image.height - size) / 2,
      width: size,
      height: size
    };
    this.render();
  }

  // Start drag for crop adjustment
  startDrag(e) {
    this.isDragging = true;
    const rect = this.canvas.getBoundingClientRect();
    this.dragStart = {
      x: (e.clientX - rect.left) / this.scale,
      y: (e.clientY - rect.top) / this.scale
    };
  }

  // Drag to adjust crop
  drag(e) {
    if (!this.isDragging) return;
    
    const rect = this.canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / this.scale;
    const y = (e.clientY - rect.top) / this.scale;
    
    const dx = x - this.dragStart.x;
    const dy = y - this.dragStart.y;
    
    // Update crop position
    this.cropData.x = Math.max(0, Math.min(this.image.width - this.cropData.width, this.cropData.x + dx));
    this.cropData.y = Math.max(0, Math.min(this.image.height - this.cropData.height, this.cropData.y + dy));
    
    this.dragStart = { x, y };
    this.render();
  }

  // End drag
  endDrag() {
    this.isDragging = false;
  }

  // Render the image with all transformations
  render() {
    // Clear canvas
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Apply rotation
    this.ctx.save();
    const centerX = this.canvas.width / 2;
    const centerY = this.canvas.height / 2;
    
    this.ctx.translate(centerX, centerY);
    this.ctx.rotate((this.rotation * Math.PI) / 180);
    this.ctx.translate(-centerX, -centerY);

    // Apply brightness filter
    this.ctx.filter = `brightness(${this.brightness}%)`;

    // Draw image
    this.ctx.drawImage(
      this.image,
      this.cropData.x,
      this.cropData.y,
      this.cropData.width,
      this.cropData.height,
      0,
      0,
      this.canvas.width,
      this.canvas.height
    );

    this.ctx.restore();

    // Draw crop overlay
    if (this.cropData.width !== this.image.width || this.cropData.height !== this.image.height) {
      this.ctx.strokeStyle = '#00bcd4';
      this.ctx.lineWidth = 2;
      this.ctx.setLineDash([5, 5]);
      this.ctx.strokeRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.setLineDash([]);
    }
  }

  // Save edited image
  async save() {
    // Create a new canvas with the final size
    const outputCanvas = document.createElement('canvas');
    const outputCtx = outputCanvas.getContext('2d');

    // Calculate output size based on rotation
    const isRotated = Math.abs(this.rotation % 180) === 90;
    outputCanvas.width = isRotated ? this.cropData.height : this.cropData.width;
    outputCanvas.height = isRotated ? this.cropData.width : this.cropData.height;

    // Apply transformations
    outputCtx.translate(outputCanvas.width / 2, outputCanvas.height / 2);
    outputCtx.rotate((this.rotation * Math.PI) / 180);
    outputCtx.filter = `brightness(${this.brightness}%)`;
    outputCtx.drawImage(
      this.image,
      this.cropData.x,
      this.cropData.y,
      this.cropData.width,
      this.cropData.height,
      -this.cropData.width / 2,
      -this.cropData.height / 2,
      this.cropData.width,
      this.cropData.height
    );

    // Convert to blob
    outputCanvas.toBlob((blob) => {
      this.close(blob);
    }, 'image/jpeg', 0.9);
  }

  // Close editor
  close(result) {
    if (this.modal) {
      this.modal.style.display = 'none';
    }
    if (this.resolveCallback) {
      this.resolveCallback(result);
      this.resolveCallback = null;
    }
  }
}

// Global instance
window.imageEditor = new ImageEditor();

// Helper function to edit image before upload
async function editImageBeforeUpload(file) {
  return await window.imageEditor.open(file);
}
