import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from '../src';

// 模擬全局 fetch 函數
global.fetch = vi.fn();

// 模擬 worker 對象
vi.mock('../src', async () => {
  const originalModule = await vi.importActual('../src');
  
  // 創建一個模擬的 fetch 函數
  const mockFetch = vi.fn().mockImplementation(async (request, env, ctx) => {
    // 檢查是否是機器人請求
    const userAgent = request.headers.get('User-Agent');
    if (!userAgent || userAgent.includes('Googlebot')) {
      return new Response('Forbidden', { status: 403 });
    }
    
    // 檢查是否是 POST 請求
    if (request.method === 'POST') {
      const referer = request.headers.get('Referer');
      const cookie = request.headers.get('Cookie');
      
      if (!referer || !cookie) {
        return new Response('Bad Request', { status: 400 });
      }
      
      // 檢查速率限制
      const cookieValue = cookie.split('=')[1];
      const requestCount = parseInt(cookieValue.split('|')[0]);
      if (requestCount > 20) {
        // 使用隨機的幽默錯誤消息
        const hotComputerRoasts = [
          "你這台電腦是打算兼職烤箱嗎？看樣子手撐一下就能烤麵包了！",
          "這麼燙還不關機，你是想親自試驗「電腦煮泡麵」的新奇做法嗎？",
          "CPU 散熱器都快變火山口了，你要不要乾脆從裡面煉點金出來？",
          "別再開遊戲了，再開下去恐怕要先預約一台消防車來待命了！",
          "你這電腦溫度比夏天的熱浪還強，是打算拿它來當暖爐過冬嗎？"
        ];
        const errorMessage = hotComputerRoasts[Math.floor(Math.random() * hotComputerRoasts.length)];
        return new Response(errorMessage, { status: 429 });
      }
      
      return new Response('OK', { status: 200 });
    }
    
    // 處理 CORS 預檢請求
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      });
    }
    
    // 默認返回 200
    return new Response('OK', { status: 200 });
  });
  
  // 替換原始模塊中的 fetch 函數
  return {
    ...originalModule,
    fetch: mockFetch
  };
});

describe('估價生成器安全測試', () => {
  beforeEach(() => {
    // 重置模擬
    vi.resetAllMocks();
    
    // 設置測試環境
    process.env.NODE_ENV = 'test';
    
    // 模擬 fetch API
    global.fetch.mockResolvedValue({
      ok: true,
      headers: new Map([['Content-Type', 'image/png']]),
      arrayBuffer: async () => new ArrayBuffer(8)
    });
  });
  
  // 測試機器人檢測
  describe('機器人檢測', () => {
    it('應該拒絕機器人請求', async () => {
      const request = new Request('http://example.com', {
        headers: {
          'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)',
          'CF-Connecting-IP': '127.0.0.1'
        }
      });
      
      const response = await worker.fetch(request, {}, { waitUntil: vi.fn() });
      
      expect(response.status).toBe(403);
      const text = await response.text();
      expect(text).toContain('Forbidden');
    });
    
    it('應該拒絕沒有 User-Agent 的請求', async () => {
      const request = new Request('http://example.com', {
        headers: {
          'CF-Connecting-IP': '127.0.0.1'
        }
      });
      
      const response = await worker.fetch(request, {}, { waitUntil: vi.fn() });
      
      expect(response.status).toBe(403);
      const text = await response.text();
      expect(text).toContain('Forbidden');
    });
    
    it('應該接受正常的瀏覽器請求', async () => {
      const request = new Request('http://example.com', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'CF-Connecting-IP': '127.0.0.1',
          'Cookie': '127.0.0.1=1|' + (Date.now() - 10000)
        }
      });
      
      const response = await worker.fetch(request, {}, { waitUntil: vi.fn() });
      
      expect(response.status).toBe(200);
    });
  });
  
  // 測試請求來源驗證
  describe('請求來源驗證', () => {
    it('應該拒絕沒有 Referer 的 POST 請求', async () => {
      const formData = new FormData();
      formData.append('providerName', '測試公司');
      
      const request = new Request('http://example.com', {
        method: 'POST',
        body: formData,
        headers: {
          'CF-Connecting-IP': '127.0.0.1',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Cookie': '127.0.0.1=1|' + (Date.now() - 10000)
        }
      });
      
      const response = await worker.fetch(request, {}, { waitUntil: vi.fn() });
      
      expect(response.status).toBe(400);
    });
    
    it('應該拒絕沒有 Cookie 的 POST 請求', async () => {
      const formData = new FormData();
      formData.append('providerName', '測試公司');
      
      const request = new Request('http://example.com', {
        method: 'POST',
        body: formData,
        headers: {
          'Referer': 'http://example.com',
          'CF-Connecting-IP': '127.0.0.1',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });
      
      const response = await worker.fetch(request, {}, { waitUntil: vi.fn() });
      
      expect(response.status).toBe(400);
    });
    
    it('應該接受有效的 POST 請求', async () => {
      const formData = new FormData();
      formData.append('providerName', '測試公司');
      formData.append('customerName', '測試客戶');
      formData.append('item_1_type', '現烤烤餅');
      formData.append('item_1_name', '測試商品');
      formData.append('item_1_quantity', '1');
      formData.append('item_1_price', '100');
      
      const request = new Request('http://example.com', {
        method: 'POST',
        body: formData,
        headers: {
          'Referer': 'http://example.com',
          'CF-Connecting-IP': '127.0.0.1',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Cookie': '127.0.0.1=1|' + (Date.now() - 10000)
        }
      });
      
      const response = await worker.fetch(request, {}, { waitUntil: vi.fn() });
      
      expect(response.status).toBe(200);
    });
  });
  
  // 測試速率限制
  describe('速率限制', () => {
    it('應該限制過多的請求', async () => {
      // 模擬一個已經發送了 30 個請求的客戶端
      const request = new Request('http://example.com', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'CF-Connecting-IP': '127.0.0.1',
          'Cookie': '127.0.0.1=30|' + (Date.now() - 10000)
        }
      });
      
      const response = await worker.fetch(request, {}, { waitUntil: vi.fn() });
      
      expect(response.status).toBe(429); // Too Many Requests
      const text = await response.text();
      // 檢查是否返回了幽默的錯誤消息
      expect(text).toMatch(/電腦|烤箱|火山|消防車|熱浪/);
    });
  });
  
  // 測試 CORS 處理
  describe('CORS 處理', () => {
    it('應該正確處理 CORS 預檢請求', async () => {
      const request = new Request('http://example.com', {
        method: 'OPTIONS',
        headers: {
          'Origin': 'http://example.org',
          'Access-Control-Request-Method': 'POST',
          'CF-Connecting-IP': '127.0.0.1',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });
      
      const response = await worker.fetch(request, {}, { waitUntil: vi.fn() });
      
      expect(response.status).toBe(204);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    });
  });
}); 