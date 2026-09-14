/// <reference types="vite/client" />

// 让 TS 认识 `import.meta.env`（Vite 注入的编译期常量）。
// 缺这个文件时 `import.meta.env.DEV` 会报 TS2339 —— 类型检查与运行时都依赖它。
