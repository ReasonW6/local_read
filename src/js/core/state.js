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
  readingHistory: {}, // 记录每本书的阅读历史 {bookPath: {name, path, lastReadTime, readCount}}
  currentlyReading: null, // 当前正在阅读的书籍路径
  bookmarks: [] // 书签数组
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