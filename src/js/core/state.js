// State management for the application
export const state = {
  type: null, 
  book: null, 
  rendition: null, 
  chapters: [], 
  currentIndex: 0,
  fontSize: 18, 
  theme: 'light', 
  txtPages: [], 
  currentFileKey: null, 
  bookshelf: [],
  sidebarView: 'toc',
  isNavigating: false,
  lastReadBook: null, // 记录最后阅读的书籍
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
    txtPages: [],
    currentFileKey: null,
    bookmarks: []
  });
}

export function setNavigating(isNavigating) {
  state.isNavigating = isNavigating;
}

export default state;