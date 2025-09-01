// State management for the application
export const state = {
  type: null, 
  book: null, 
  rendition: null, 
  chapters: [], 
  currentIndex: 0,
  currentChapterIndex: -1, // PDF模式下的当前章节索引
  fontSize: 18, 
  theme: 'light', 
  txtPages: [], 
  currentFileKey: null, 
  bookshelf: [],
  sidebarView: 'toc',
  isNavigating: false,
  lastReadBook: null, // 记录最后阅读的书籍
  bookmarks: [], // 书签数组
  isolateBookConfig: false // 是否隔离书籍配置（每本书独立设置）
};

// State update functions
export function updateState(updates) {
  Object.assign(state, updates);
}

export function resetBookState() {
  updateState({
    type: null,
    book: null,
    rendition: null,
    chapters: [],
    currentIndex: 0,
    currentChapterIndex: -1,
    txtPages: [],
    currentFileKey: null,
    bookmarks: []
  });
}

export function setNavigating(isNavigating) {
  state.isNavigating = isNavigating;
}

export default state;