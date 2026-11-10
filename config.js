// 站点设置：改这里就能换名字、简介、社交链接和分类
// 文字可以写成 { zh: "中文", en: "English" }，网站会按访客的语言显示；只写一个字符串则两种语言都显示它
window.SITE = {
  name: "Maggie T",
  title: { zh: "光影集 · Photography", en: "Light & Shadow · Photography" },
  tagline: {
    zh: "用镜头记录走过的地方、遇见的人和天空。",
    en: "Places I've been, people I've met, and the sky above, through my lens.",
  },
  about: {
    zh: "业余摄影爱好者，常在旅途与航线上拍照。这里收集了我最喜欢的作品，按类别和时间整理。",
    en: "An amateur photographer who shoots on the road and in the air. These are my favorite photos, organized by category and time.",
  },
  links: [
    { label: "Instagram", url: "https://instagram.com/" },
    { label: { zh: "小红书", en: "RedNote" }, url: "https://www.xiaohongshu.com/" },
    { label: "Email", url: "mailto:you@example.com" },
  ],
  // key 对应照片文件夹（桌面 GitHub_Portfolio）里的子文件夹名，大小写要一致
  categories: [
    { key: "Architecture", zh: "建筑", en: "Architecture" },
    { key: "Nature", zh: "自然", en: "Nature" },
    { key: "Culture", zh: "人文", en: "Culture" },
    { key: "InTheClouds", zh: "云端", en: "In the Clouds" },
    { key: "Casablanca_BW", zh: "卡萨布兰卡 · 黑白", en: "Casablanca B&W" },
  ],
};
