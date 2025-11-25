// 添加书籍弹窗模块 - 共享于 app.js 和 bookshelfApp.js
import { formatFileSize, getFileExtension } from '../core/utils.js';

// 弹窗状态
const modalState = {
  files: [],
  isUploading: false
};

// DOM 元素缓存
let elements = null;

/**
 * 获取 DOM 元素
 */
function getElements() {
  if (elements) return elements;
  
  elements = {
    mask: document.getElementById('addBooksMask'),
    closeBtn: document.getElementById('addBooksClose'),
    dropZone: document.getElementById('dropZone'),
    selectFilesBtn: document.getElementById('selectFilesBtn'),
    fileInput: document.getElementById('fileInputModal'),
    clearFilesBtn: document.getElementById('clearFilesBtn'),
    cancelBtn: document.getElementById('cancelAddBtn'),
    confirmBtn: document.getElementById('confirmAddBtn'),
    filesList: document.getElementById('filesList')
  };
  
  return elements;
}

/**
 * 打开添加书籍弹窗
 */
export function openAddBooksModal() {
  const els = getElements();
  if (els.mask) {
    modalState.files = [];
    modalState.isUploading = false;
    updateFilesDisplay();
    updateConfirmButton();
    els.mask.classList.add('show');
  }
}

/**
 * 关闭添加书籍弹窗
 */
export function closeAddBooksModal() {
  const els = getElements();
  if (els.mask) {
    els.mask.classList.remove('show');
    modalState.files = [];
    modalState.isUploading = false;
  }
}

/**
 * 处理拖拽悬停
 */
function handleModalDragOver(event) {
  event.preventDefault();
  event.dataTransfer.dropEffect = 'copy';
}

/**
 * 处理拖拽进入
 */
function handleModalDragEnter(event) {
  event.preventDefault();
  event.currentTarget.classList.add('drag-over');
}

/**
 * 处理拖拽离开
 */
function handleModalDragLeave(event) {
  event.preventDefault();
  if (!event.currentTarget.contains(event.relatedTarget)) {
    event.currentTarget.classList.remove('drag-over');
  }
}

/**
 * 处理拖拽放下
 */
function handleModalDrop(event) {
  event.preventDefault();
  event.currentTarget.classList.remove('drag-over');
  const files = Array.from(event.dataTransfer.files);
  addFilesToModal(files);
}

/**
 * 处理文件选择
 */
function handleModalFileSelect(event) {
  const files = Array.from(event.target.files);
  addFilesToModal(files);
  event.target.value = '';
}

/**
 * 添加文件到弹窗列表
 */
function addFilesToModal(files) {
  const supportedFiles = files.filter(file => {
    const ext = file.name.toLowerCase();
    return ext.endsWith('.epub') || ext.endsWith('.txt') || ext.endsWith('.pdf');
  });

  if (supportedFiles.length === 0) {
    showNotification('请选择 .epub、.txt 或 .pdf 格式的文件', 'error');
    return;
  }

  if (supportedFiles.length !== files.length) {
    const skipped = files.length - supportedFiles.length;
    showNotification(`已忽略 ${skipped} 个不支持的文件`, 'info');
  }

  supportedFiles.forEach(file => {
    const exists = modalState.files.some(f => 
      f.name === file.name && f.size === file.size
    );
    if (!exists) {
      modalState.files.push(file);
    }
  });

  updateFilesDisplay();
  updateConfirmButton();
}

/**
 * 显示通知（根据页面类型使用不同方式）
 */
function showNotification(message, type = 'info') {
  // 尝试使用 toast（书架页面）
  const toast = document.getElementById('toast');
  if (toast) {
    toast.textContent = message;
    toast.dataset.type = type;
    toast.classList.add('show');
    clearTimeout(showNotification._timer);
    showNotification._timer = setTimeout(() => {
      toast.classList.remove('show');
    }, 2500);
    return;
  }
  
  // 回退使用 alert
  alert(message);
}

/**
 * 更新文件列表显示
 */
function updateFilesDisplay() {
  const els = getElements();
  if (!els.filesList) return;

  if (modalState.files.length === 0) {
    els.filesList.innerHTML = `<div class="files-empty"><p>还没有选择任何文件</p></div>`;
    return;
  }

  els.filesList.innerHTML = modalState.files.map((file, index) => {
    const ext = getFileExtension(file.name);
    const size = formatFileSize(file.size);
    
    return `
      <div class="file-item">
        <div class="file-icon ${ext}">${ext}</div>
        <div class="file-info">
          <p class="file-name" title="${file.name}">${file.name}</p>
          <p class="file-size">${size}</p>
        </div>
        <button class="file-remove" data-index="${index}" title="移除">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    `;
  }).join('');
  
  // 绑定移除按钮事件
  els.filesList.querySelectorAll('.file-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const index = parseInt(e.currentTarget.dataset.index, 10);
      removeFileFromModal(index);
    });
  });
}

/**
 * 从列表中移除文件
 */
function removeFileFromModal(index) {
  modalState.files.splice(index, 1);
  updateFilesDisplay();
  updateConfirmButton();
}

/**
 * 更新确认按钮状态
 */
function updateConfirmButton() {
  const els = getElements();
  if (!els.confirmBtn) return;

  const hasFiles = modalState.files.length > 0;
  const isUploading = modalState.isUploading;
  
  els.confirmBtn.disabled = !hasFiles || isUploading;
  
  const btnText = els.confirmBtn.querySelector('.btn-text');
  const btnLoading = els.confirmBtn.querySelector('.btn-loading');
  
  if (btnText && btnLoading) {
    if (isUploading) {
      btnText.style.display = 'none';
      btnLoading.style.display = 'flex';
    } else {
      btnText.style.display = 'block';
      btnLoading.style.display = 'none';
      btnText.textContent = hasFiles ? `添加 ${modalState.files.length} 个书籍` : '添加书籍';
    }
  }
}

/**
 * 初始化添加书籍弹窗
 * @param {Function} uploadHandler - 上传处理函数
 */
export function initAddBooksModal(uploadHandler) {
  const els = getElements();
  
  if (els.closeBtn) {
    els.closeBtn.addEventListener('click', closeAddBooksModal);
  }
  
  if (els.cancelBtn) {
    els.cancelBtn.addEventListener('click', closeAddBooksModal);
  }

  if (els.mask) {
    els.mask.addEventListener('click', (e) => {
      if (e.target === els.mask) closeAddBooksModal();
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && els.mask && els.mask.classList.contains('show')) {
      closeAddBooksModal();
    }
  });

  if (els.dropZone) {
    els.dropZone.addEventListener('click', (e) => {
      if (e.target !== els.selectFilesBtn && els.fileInput) {
        els.fileInput.click();
      }
    });
    els.dropZone.addEventListener('dragover', handleModalDragOver);
    els.dropZone.addEventListener('dragenter', handleModalDragEnter);
    els.dropZone.addEventListener('dragleave', handleModalDragLeave);
    els.dropZone.addEventListener('drop', handleModalDrop);
  }

  if (els.selectFilesBtn) {
    els.selectFilesBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (els.fileInput) els.fileInput.click();
    });
  }

  if (els.fileInput) {
    els.fileInput.addEventListener('change', handleModalFileSelect);
  }
  
  if (els.clearFilesBtn) {
    els.clearFilesBtn.addEventListener('click', () => {
      modalState.files = [];
      updateFilesDisplay();
      updateConfirmButton();
    });
  }
  
  if (els.confirmBtn) {
    els.confirmBtn.addEventListener('click', async () => {
      if (modalState.files.length === 0 || modalState.isUploading) return;

      modalState.isUploading = true;
      updateConfirmButton();

      try {
        await uploadHandler(modalState.files);
        setTimeout(() => closeAddBooksModal(), 500);
      } catch (error) {
        console.error('Upload failed:', error);
      } finally {
        modalState.isUploading = false;
        updateConfirmButton();
      }
    });
  }
}

/**
 * 获取当前待上传文件列表
 */
export function getModalFiles() {
  return [...modalState.files];
}

/**
 * 检查弹窗是否已打开
 */
export function isModalOpen() {
  const els = getElements();
  return els.mask && els.mask.classList.contains('show');
}
