# CodeBook — haruband.github.io

[Astro](https://astro.build) 로 만든 기술 블로그입니다. `main` 에 푸시하면 GitHub Actions 가 빌드해서 `pages` 브랜치로 배포합니다.

## 로컬 미리보기

```bash
npm install
npm run dev      # http://localhost:4321
```

## 글 쓰기

`src/content/posts/<slug>/index.md` 를 만들고 이미지는 같은 폴더에 둡니다. 주소는 `https://haruband.github.io/<slug>/` 가 됩니다.

```markdown
---
title: "[K8S/Cilium] 제목"
date: 2026-11-24
tags: ["K8S", "Cilium"]
series: "Cilium"   # 선택
draft: true        # 선택, 공개하지 않을 때
---
```

## 경력서

`/about/` 페이지 내용은 `src/data/resume.ts` 에서 수정합니다. 페이지의 "PDF로 저장" 버튼으로 A4 PDF 를 만들 수 있습니다.
