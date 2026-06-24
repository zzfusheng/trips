const express = require('express');
const { handleChat, searchFlight, searchHotel, searchPoi, isAvailable, refreshRecommend, searchActivity, getHotDestinations } = require('../services/chat');

const router = express.Router();

/**
 * POST /api/ai/chat
 * AI 对话接口
 */
router.post('/ai/chat', async (req, res) => {
  try {
    const { query, history = [], context } = req.body;
    if (!query) {
      return res.status(400).json({ error: '缺少 query 参数' });
    }

    console.log(`[API] /ai/chat query="${query.substring(0, 50)}..."`);
    const response = await handleChat(query, history, context);
    res.json(response);
  } catch (err) {
    console.error('[API] /ai/chat 错误:', err);
    res.status(500).json({ error: 'AI 服务异常' });
  }
});

/**
 * POST /api/travel/search-flight
 * 机票搜索
 */
router.post('/travel/search-flight', (req, res) => {
  try {
    const { origin, destination, depDate, backDate, journeyType, seatClassName, maxPrice, sortType } = req.body;
    if (!origin) {
      return res.status(400).json({ error: '缺少 origin 参数' });
    }

    console.log(`[API] /travel/search-flight ${origin} → ${destination}`);
    const result = searchFlight({
      origin, destination, depDate, backDate, journeyType, seatClassName, maxPrice, sortType
    });
    res.json(result);
  } catch (err) {
    console.error('[API] /travel/search-flight 错误:', err);
    res.status(500).json({ error: '机票搜索失败' });
  }
});

/**
 * POST /api/travel/search-hotel
 * 酒店搜索
 */
router.post('/travel/search-hotel', (req, res) => {
  try {
    const { destName, checkInDate, checkOutDate, hotelStars, maxPrice, poiName, sort, keyWords } = req.body;
    if (!destName) {
      return res.status(400).json({ error: '缺少 destName 参数' });
    }

    console.log(`[API] /travel/search-hotel ${destName}`);
    const result = searchHotel({
      destName, checkInDate, checkOutDate, hotelStars, maxPrice, poiName, sort, keyWords
    });
    res.json(result);
  } catch (err) {
    console.error('[API] /travel/search-hotel 错误:', err);
    res.status(500).json({ error: '酒店搜索失败' });
  }
});

/**
 * POST /api/travel/search-poi
 * 景点搜索
 */
router.post('/travel/search-poi', (req, res) => {
  try {
    const { cityName, keyword, poiLevel, category } = req.body;
    if (!cityName) {
      return res.status(400).json({ error: '缺少 cityName 参数' });
    }

    console.log(`[API] /travel/search-poi ${cityName} ${keyword || ''}`);
    const result = searchPoi({ cityName, keyword, poiLevel, category });
    res.json(result);
  } catch (err) {
    console.error('[API] /travel/search-poi 错误:', err);
    res.status(500).json({ error: '景点搜索失败' });
  }
});

/**
 * POST /api/ai/activity-search
 * 单活动 FlyAI 搜索（点击详情页时懒加载）
 */
router.post('/ai/activity-search', async (req, res) => {
  try {
    const { destination, title, type, origin, startDate } = req.body;
    if (!title) {
      return res.status(400).json({ error: '缺少 title 参数' });
    }

    console.log(`[API] /ai/activity-search "${title}" type=${type}${origin ? ' origin=' + origin : ''}`);
    const result = await searchActivity({ destination: destination || '', title, type: type || 'other', origin, startDate });
    res.json(result);
  } catch (err) {
    console.error('[API] /ai/activity-search 错误:', err);
    res.status(500).json({ error: '搜索失败' });
  }
});

/**
 * POST /api/ai/recommend
 * 换一个推荐：重新搜索同类型但未展示过的 FlyAI 商品
 */
router.post('/ai/recommend', async (req, res) => {
  try {
    const { destination, title, type, excludeTitles, reason } = req.body;
    if (!destination || !title) {
      return res.status(400).json({ error: '缺少 destination 或 title 参数' });
    }

    console.log(`[API] /ai/recommend dest="${destination}" title="${title}" type="${type}" reason="${reason || ''}"`);
    const result = await refreshRecommend({ destination, title, type, excludeTitles: excludeTitles || [], reason });
    res.json(result);
  } catch (err) {
    console.error('[API] /ai/recommend 错误:', err);
    res.status(500).json({ error: '推荐刷新失败' });
  }
});

/**
 * GET /api/ai/hot-destinations
 * 获取当季热门目的地（LLM 生成，缓存 6 小时）
 */
router.get('/ai/hot-destinations', async (req, res) => {
  try {
    console.log(`[API] /ai/hot-destinations`);
    const list = await getHotDestinations();
    if (!list) {
      return res.status(500).json({ error: '获取热门目的地失败' });
    }
    res.json({ success: true, destinations: list });
  } catch (err) {
    console.error('[API] /ai/hot-destinations 错误:', err);
    res.status(500).json({ error: '获取热门目的地异常' });
  }
});

/**
 * GET /api/health
 * 健康检查
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    flyaiAvailable: true,
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /api/ai/city-image?name=大理
 * 城市图片代理：Pexels 真实照片 → Picsum 兜底
 * 返回图片字节流（非 302），避免小程序 downloadFile 域名白名单问题
 */
const cityImageCache = new Map();
const CACHE_TTL = 3600_000; // 1 小时

router.get('/ai/city-image', async (req, res) => {
  const name = (req.query.name || '').trim();
  if (!name) return res.status(400).json({ error: 'name required' });

  // 缓存命中 → 直接返回图片字节 + Content-Type
  const cached = cityImageCache.get(name);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    res.set('Content-Type', cached.contentType);
    res.set('Cache-Control', 'public, max-age=3600');
    return res.send(cached.buffer);
  }

  let imageUrl = null;

  // 1. 尝试 Pexels（需 PEXELS_API_KEY）
  const pexelsKey = process.env.PEXELS_API_KEY;
  if (pexelsKey) {
    try {
      const pr = await fetch(
        `https://api.pexels.com/v1/search?query=${encodeURIComponent(name)}+cityscape&per_page=1&orientation=landscape`,
        { headers: { Authorization: pexelsKey }, signal: AbortSignal.timeout?.(5000) }
      );
      if (pr.ok) {
        const pd = await pr.json();
        imageUrl = pd.photos?.[0]?.src?.large || pd.photos?.[0]?.src?.medium;
        if (imageUrl) console.log(`[CityImage] Pexels: ${name} → OK`);
      }
    } catch (e) {
      console.log(`[CityImage] Pexels 失败: ${e.message}`);
    }
  }

  // 2. 兜底：Picsum
  if (!imageUrl) {
    imageUrl = `https://picsum.photos/seed/${encodeURIComponent(name)}/750/400`;
    console.log(`[CityImage] 兜底 Picsum: ${name}`);
  }

  // 拉取图片字节并代理返回
  try {
    const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout?.(8000) });
    if (!imgRes.ok) throw new Error(`HTTP ${imgRes.status}`);
    const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
    const buffer = Buffer.from(await imgRes.arrayBuffer());

    // 缓存
    cityImageCache.set(name, { buffer, contentType, ts: Date.now() });

    res.set('Content-Type', contentType);
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(buffer);
  } catch (e) {
    console.error(`[CityImage] 拉取图片失败: ${e.message}`);
    // 兜底：返回空（前端 DestImage onError → 本地图）
    res.status(502).json({ error: 'image fetch failed' });
  }
});

// ========== H5 页面代理（webview 域名白名单绕过） ==========

const PROXY_BASE = process.env.PROXY_BASE || 'https://www.zzfusheng.top';

/**
 * GET /api/proxy-page?url=xxx
 * 抓取目标 H5 页面，重写资源 URL 后通过本域返回，供 webview 加载
 */
router.get('/proxy-page', async (req, res) => {
  const targetUrl = (req.query.url || '').trim();
  if (!targetUrl) return res.status(400).json({ error: 'url required' });

  try {
    // 1. 跟随重定向获取最终 URL
    let finalUrl = targetUrl;
    let html = '';
    try {
      const r = await fetch(targetUrl, {
        redirect: 'follow',
        signal: AbortSignal.timeout?.(10000),
        headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 10; Pixel 3) AppleWebKit/537.36' }
      });
      finalUrl = r.url;
      html = await r.text();
    } catch (e) {
      console.error(`[ProxyPage] 抓取失败: ${e.message}`);
      return res.status(502).json({ error: 'fetch failed' });
    }

    // 2. 解析目标域名，用于资源 URL 重写
    let targetOrigin = '';
    try {
      const u = new URL(finalUrl);
      targetOrigin = u.origin;
    } catch {}

    if (!targetOrigin) return res.status(502).json({ error: 'invalid url' });

    // 3. 重写 HTML 中的资源 URL，让它们也走代理
    const rewriteUrl = (raw) => {
      if (!raw || raw.startsWith('data:') || raw.startsWith('#')) return raw;
      let abs;
      try { abs = new URL(raw, targetOrigin).href; } catch { return raw; }
      // 同域资源走代理
      if (abs.startsWith(targetOrigin) || abs.startsWith('http')) {
        return `${PROXY_BASE}/api/proxy-asset?url=${encodeURIComponent(abs)}`;
      }
      return raw;
    };

    // 重写 src 属性
    html = html.replace(/\bsrc\s*=\s*["']([^"']+)["']/gi, (m, url) => `src="${rewriteUrl(url)}"`);
    // 重写 href 属性（link、a 等）
    html = html.replace(/\bhref\s*=\s*["']([^"']+)["']/gi, (m, url) => `href="${rewriteUrl(url)}"`);
    // 重写 url()
    html = html.replace(/\burl\s*\(\s*["']?([^)"']+)["']?\s*\)/gi, (m, url) => `url(${rewriteUrl(url)})`);

    // 4. 注入 base 标签，兜底相对路径
    html = html.replace(/<head[^>]*>/i, `$&<base href="${targetOrigin}/">`);

    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (e) {
    console.error(`[ProxyPage] 错误: ${e.message}`);
    res.status(502).json({ error: 'proxy failed' });
  }
});

/**
 * GET /api/proxy-asset?url=xxx
 * 代理单个资源文件（CSS/JS/图片等）
 */
router.get('/proxy-asset', async (req, res) => {
  const assetUrl = (req.query.url || '').trim();
  if (!assetUrl) return res.status(400).json({ error: 'url required' });

  try {
    const r = await fetch(assetUrl, {
      signal: AbortSignal.timeout?.(8000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MiniProgram/1.0)' }
    });
    if (!r.ok) return res.status(502).end();

    const contentType = r.headers.get('content-type') || 'application/octet-stream';
    // 透传常见静态资源
    if (contentType.includes('text/') || contentType.includes('javascript') ||
        contentType.includes('image/') || contentType.includes('font/') ||
        contentType.includes('css')) {
      res.set('Content-Type', contentType);
      res.set('Cache-Control', 'public, max-age=3600');
      const buf = Buffer.from(await r.arrayBuffer());
      return res.send(buf);
    }
    // 非静态资源直接返回原始内容
    res.status(502).end();
  } catch (e) {
    console.error(`[ProxyAsset] 错误: ${e.message}`);
    res.status(502).end();
  }
});

module.exports = router;
