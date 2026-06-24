const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

/**
 * flyai CLI 封装
 * 通过子进程调用 flyai 命令，解析 JSON 结果
 */

/**
 * 检查 flyai 是否已安装（每次调用都重新检测）
 */
const isAvailable = () => {
  return true;
};

/**
 * 并发控制：限制同时执行的 FlyAI 进程数
 */
let runningCount = 0;
const MAX_CONCURRENT = 4;
const pendingQueue = [];

const enqueue = (fn) => {
  return new Promise((resolve, reject) => {
    const run = async () => {
      runningCount++;
      try {
        const result = await fn();
        resolve(result);
      } catch (err) {
        reject(err);
      } finally {
        runningCount--;
        if (pendingQueue.length > 0) {
          pendingQueue.shift()();
        }
      }
    };
    if (runningCount < MAX_CONCURRENT) {
      run();
    } else {
      pendingQueue.push(run);
    }
  });
};

/**
 * 执行 flyai 命令并解析 JSON（异步，支持并发）
 */
const runFlyai = async (command) => {
  if (!isAvailable()) {
    return { status: -1, message: 'flyai-cli 未安装', systemMessage: '请先安装 npm i -g @fly-ai/flyai-cli', data: null };
  }

  const execute = async (attempt = 1) => {
    console.log(`[FlyAI] 执行命令${attempt > 1 ? ` (重试 ${attempt}/3)` : ''}: ${command}`);

    let stdout;
    try {
      const result = await execAsync(command, {
        encoding: 'utf-8',
        timeout: 60000,
        maxBuffer: 10 * 1024 * 1024
      });
      stdout = result.stdout;
    } catch (err) {
      // 429 限流或临时错误，等待后重试
      if (attempt < 3 && (err.message.includes('429') || err.message.includes('ETIMEDOUT') || err.message.includes('ECONNRESET'))) {
        const waitMs = attempt * 3000;
        console.log(`[FlyAI] 429/网络错误，${waitMs / 1000}s 后重试...`);
        await new Promise(r => setTimeout(r, waitMs));
        return execute(attempt + 1);
      }
      console.error(`[FlyAI] 命令失败: ${command}`, err.message);
      return { status: -1, message: err.message, systemMessage: 'flyai 调用失败', data: null };
    }

    console.log(`[FlyAI] 原始输出:\n${stdout}`);

    // 过滤掉非 JSON 输出（如注释、体验模式提示等）
    const lines = stdout.trim().split('\n');
    let jsonOutput = '';

    for (const line of lines) {
      const trimmed = line.trim();
      // 跳过注释行和空行
      if (trimmed.startsWith('#') || trimmed === '') {
        console.log(`[FlyAI] 跳过注释/空行: ${line}`);
        continue;
      }
      // 跳过体验模式提示
      if (trimmed.includes('体验模式') || trimmed.includes('获取正式API Key')) {
        console.log(`[FlyAI] 跳过体验模式提示: ${line}`);
        continue;
      }
      jsonOutput += line + '\n';
    }

    jsonOutput = jsonOutput.trim();
    console.log(`[FlyAI] 过滤后 JSON:\n${jsonOutput}`);

    if (!jsonOutput) {
      console.log('[FlyAI] 过滤后为空');
      return { status: -1, message: 'flyai 返回空结果', systemMessage: '当前为体验模式，部分搜索结果可能受限', data: null };
    }

    const result = JSON.parse(jsonOutput);
    console.log(`[FlyAI] JSON 解析成功: status=${result.status}`);
    return result;
  };

  try {
    return await enqueue(execute);
  } catch (err) {
    console.error(`[FlyAI] 命令失败: ${command}`, err.message);
    return { status: -1, message: err.message, systemMessage: 'flyai 调用失败', data: null };
  }
};

const FLYAI_CMD = '/usr/local/bin/flyai';

/**
 * AI 语义搜索 - 最通用的接口，支持自然语言查询
 */
const aiSearch = (query) => {
  return runFlyai(`${FLYAI_CMD} ai-search --query "${query.replace(/"/g, '\\"')}"`);
};

/**
 * 关键词搜索 - 支持机票/酒店/景点/签证等多种场景
 */
const keywordSearch = (query) => {
  return runFlyai(`${FLYAI_CMD} keyword-search --query "${query.replace(/"/g, '\\"')}"`);
};

/**
 * 机票搜索
 */
const searchFlight = (params) => {
  const args = [`--origin "${params.origin}"`];
  if (params.destination) args.push(`--destination "${params.destination}"`);
  if (params.depDate) args.push(`--dep-date ${params.depDate}`);
  if (params.backDate) args.push(`--back-date ${params.backDate}`);
  if (params.journeyType) args.push(`--journey-type ${params.journeyType}`);
  if (params.seatClassName) args.push(`--seat-class-name "${params.seatClassName}"`);
  if (params.maxPrice) args.push(`--max-price ${params.maxPrice}`);
  if (params.sortType) args.push(`--sort-type ${params.sortType}`);
  if (params.depDateStart) args.push(`--dep-date-start ${params.depDateStart}`);
  if (params.depDateEnd) args.push(`--dep-date-end ${params.depDateEnd}`);
  return runFlyai(`${FLYAI_CMD} search-flight ${args.join(' ')}`);
};

/**
 * 酒店搜索
 */
const searchHotel = (params) => {
  const args = [`--dest-name "${params.destName}"`];
  if (params.checkInDate) args.push(`--check-in-date ${params.checkInDate}`);
  if (params.checkOutDate) args.push(`--check-out-date ${params.checkOutDate}`);
  if (params.poiName) args.push(`--poi-name "${params.poiName}"`);
  if (params.hotelStars) args.push(`--hotel-stars "${params.hotelStars}"`);
  if (params.hotelTypes) args.push(`--hotel-types "${params.hotelTypes}"`);
  if (params.maxPrice) args.push(`--max-price ${params.maxPrice}`);
  if (params.sort) args.push(`--sort ${params.sort}`);
  if (params.keyWords) args.push(`--key-words "${params.keyWords}"`);
  return runFlyai(`${FLYAI_CMD} search-hotel ${args.join(' ')}`);
};

/**
 * 景点搜索
 */
const searchPoi = (params) => {
  const args = [`--city-name "${params.cityName}"`];
  if (params.keyword) args.push(`--keyword "${params.keyword}"`);
  if (params.poiLevel) args.push(`--poi-level ${params.poiLevel}`);
  if (params.category) args.push(`--category "${params.category}"`);
  return runFlyai(`${FLYAI_CMD} search-poi ${args.join(' ')}`);
};

module.exports = {
  runFlyai,
  aiSearch,
  keywordSearch,
  searchFlight,
  searchHotel,
  searchPoi,
  isAvailable
};
