# 光影集 · Photography

**Maggie T 的个人摄影作品集**: 旅途、城市、人文与云端的影像，按类别与时间整理。

A personal photography portfolio by Maggie T, with photos from travels, cities, people and the sky, organized by category and time.

### 👉 [magicmagi.github.io/photos](https://magicmagi.github.io/photos/)

---

## 分类 · Categories

| 分类 | Category | 照片 |
|---|---|---|
| [建筑](https://magicmagi.github.io/photos/#/Architecture) | Architecture | 18 |
| [自然](https://magicmagi.github.io/photos/#/Nature) | Nature | 8 |
| [人文](https://magicmagi.github.io/photos/#/Culture) | Culture | 30 |
| [云端](https://magicmagi.github.io/photos/#/InTheClouds) | In the Clouds | 18 |
| [卡萨布兰卡 · 黑白](https://magicmagi.github.io/photos/#/Casablanca_BW) | Casablanca B&W | 10 |

拍摄时间跨度 2018 年至 2026 年。

## 功能 · Features

- **分类浏览**：每个分类都有独立链接，可以直接分享
- **按时间排序**：可选最新或最早优先，并可按年份分组
- **单张分享**：每张照片都有独立链接（`#/photo/<id>`），在照片查看页面一键复制
- **照片查看**：支持键盘 ← → 翻页、Esc 关闭，手机上可以左右滑动
- **适配手机与电脑**，自动跟随系统的深色或浅色模式

## 版权与隐私 · Copyright & Privacy

- 公开展示的照片长边不超过 1600 像素，带 "© Maggie T" 水印，并去除了全部 EXIF 信息（包括 GPS 位置）
- **原图与拍摄参数**（相机、镜头、光圈、快门、ISO）经过 AES-256-GCM 加密，只有输入密码才能查看。解密在浏览器本地完成，密码不会发送到任何地方
- 原始照片文件不在本仓库中

## 项目结构 · How it works

纯静态网站，无需框架或构建工具，由 GitHub Pages 托管。

```
index.html      页面结构
style.css       样式
app.js          画廊、照片查看、路由、解锁逻辑
config.js       站点设置：名字、简介、社交链接、分类
photos.js       照片列表（由 build.py 生成）
img/            公开的展示图和缩略图（带水印）
secure/         加密的原图与拍摄参数
build.py        导入脚本
```

### 更新照片

1. 把照片按分类放入本地照片文件夹，子文件夹名与 `config.js` 中的分类 `key` 一致
2. 运行导入脚本，并输入查看原图的密码：
   ```bash
   pip install pillow cryptography
   python3 build.py
   ```
   脚本会读取 EXIF 拍摄时间，生成带水印的展示图和缩略图，加密原图，并更新 `photos.js`
3. 提交并推送，GitHub Pages 会在 1 到 2 分钟内自动更新

标题、地点和描述写在照片文件夹的 `captions.json` 里，脚本会为新照片自动生成空条目。

## License

© Maggie T. All rights reserved.
本仓库中的所有照片均受版权保护，未经许可不得复制、转载或用于商业用途。
All photographs in this repository are copyrighted and may not be reproduced, distributed or used commercially without permission.
