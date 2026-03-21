// 最小化测试脚本
console.log('process.type:', process.type);
console.log('process.versions.electron:', process.versions.electron);
const electron = require('electron');
console.log('typeof electron:', typeof electron);
if (typeof electron === 'string') {
  console.log('electron path:', electron);
} else {
  console.log('keys:', Object.keys(electron));
}
process.exit(0);
