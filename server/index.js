require('dotenv').config();
const express = require('express');
const cors = require('cors');
const travelRoutes = require('./routes/travel');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(express.json());

// 请求日志
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// 路由
app.use('/api', travelRoutes);

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found', path: req.path });
});

// 全局错误处理
app.use((err, req, res, next) => {
  console.error('[Server] 未捕获错误:', err);
  res.status(500).json({ error: '服务器内部错误' });
});

// 启动
const server = app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════╗
  ║  旅行规划小程序 后端服务                   ║
  ║  端口: ${PORT}                             ║
  ║  健康检查: http://localhost:${PORT}/api/health ║
  ╚══════════════════════════════════════════╝
  `);

  // 检查 flyai 安装状态
  try {
    require('child_process').execSync('flyai --version', { stdio: 'pipe' });
    console.log('✅ flyai-cli 已就绪');
  } catch {
    console.log('⚠️  flyai-cli 未安装，执行: npm i -g @fly-ai/flyai-cli');
  }
});

// 请求超时 120s（LLM + FlyAI 搜索需要较长时间）
server.timeout = 120000;

// 优雅退出
process.on('SIGINT', () => {
  console.log('\n[Server] 正在关闭...');
  process.exit(0);
});
