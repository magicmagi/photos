// 站点设置：改这里就能换名字、简介、社交链接和分类
window.SITE = {
  name: "Your Name",
  title: "光影集 · Photography",
  tagline: "用镜头记录走过的地方、遇见的人和天空。",
  about:
    "业余摄影爱好者，常在旅途与航线上拍照。这里收集了我最喜欢的作品，按类别和时间整理。",
  links: [
    { label: "Instagram", url: "https://instagram.com/" },
    { label: "小红书", url: "https://www.xiaohongshu.com/" },
    { label: "Email", url: "mailto:you@example.com" },
  ],
  // key 对应 photos/ 下的子文件夹名
  categories: [
    { key: "places", zh: "地点", en: "Places" },
    { key: "architecture", zh: "建筑", en: "Architecture" },
    { key: "nature", zh: "自然", en: "Nature" },
    { key: "flight", zh: "飞行", en: "Flight" },
    { key: "people", zh: "人文", en: "People & Culture" },
  ],
};
