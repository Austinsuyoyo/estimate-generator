// index.js
import formHtml from './form.html';
import quoteTemplate from './quote.html';

const DEFAULT_LOGO_URL = "https://ugc.production.linktr.ee/T2LwXZuRACGuwBNY6jQP_ClMq2eT4AEv08bkc";

// 使用常量對象存儲配置和消息
const CONFIG = {
	maxRequests: 30, // 每分鐘最大請求數
	timeWindow: 60 * 1000, // 60 秒
	botPatterns: /bot|crawler|spider|curl|wget|python|java/i,
	hotComputerRoasts: [
		"你這台電腦是打算兼職烤箱嗎？看樣子手撐一下就能烤麵包了！",
		"這麼燙還不關機，你是想親自試驗「電腦煮泡麵」的新奇做法嗎？",
		"CPU 散熱器都快變火山口了，你要不要乾脆從裡面煉點金出來？",
		"別再開遊戲了，再開下去恐怕要先預約一台消防車來待命了！",
		"你這電腦溫度比夏天的熱浪還強，是打算拿它來當暖爐過冬嗎？"
	]
};

export default {
	async fetch(request, env, ctx) {
		// 檢查是否為機器人或超過請求頻率
		const botCheck = await checkForBots(request);
		if (botCheck.status !== 200) {
			// 如果狀態不是 200，直接返回對應錯誤
			return new Response(botCheck.message, { status: botCheck.status });
		}

		// 處理 CORS 預檢請求
		if (request.method === "OPTIONS") {
			return handleCorsPreflightRequest();
		}

		// 根據請求方法處理
		if (request.method === "GET") {
			const response = new Response(formHtml, { headers: { "Content-Type": "text/html; charset=utf-8" } });
			if (botCheck.newCookie) response.headers.append("Set-Cookie", botCheck.newCookie);
			return response;
		} else if (request.method === "POST") {
			// 驗證請求來源
			const { isValid, errorResponse } = validateRequestSource(request);
			if (!isValid) return errorResponse;

			// 處理表單數據
			const formData = await request.formData();
			const processedData = await processFormData(formData);
			const outputHtml = templateReplace(quoteTemplate, processedData);

			// 回應
			const response = new Response(outputHtml, { headers: { "Content-Type": "text/html; charset=utf-8" } });
			if (botCheck.newCookie) response.headers.append("Set-Cookie", botCheck.newCookie);
			return response;
		} else {
			return new Response("Method Not Allowed", { status: 405 });
		}
	}
};

// 驗證請求來源
function validateRequestSource(request) {
	const refererHeader = request.headers.get("Referer") || "";
	const cookies = getCookies(request);
	const clientIP = request.headers.get("CF-Connecting-IP") || "unknown";
	const lastRequestData = cookies[clientIP] ? cookies[clientIP].split("|") : null;

	if (!refererHeader || !lastRequestData) {
		// 不符合條件，返回隨機錯誤訊息
		const randomIndex = Math.floor(Math.random() * CONFIG.hotComputerRoasts.length);
		const errorMessage = CONFIG.hotComputerRoasts[randomIndex];
		
		return {
			isValid: false,
			errorResponse: new Response(errorMessage, { status: 400 })
		};
	}

	return { isValid: true };
}

// 處理表單數據
async function processFormData(formData) {
	// 定義表單欄位配置
	const FORM_FIELDS = [
		// 乙方資料（報價方）
		{ key: "providerLogo", defaultValue: DEFAULT_LOGO_URL },
		{ key: "providerName", defaultValue: "" },
		{ key: "providerAddress", defaultValue: "" },
		{ key: "providerPhone", defaultValue: "" },
		{ key: "providerStaffName", defaultValue: "" },
		// 客戶資料
		{ key: "customerName", defaultValue: "" },
		{ key: "customerAddress", defaultValue: "" },
		{ key: "customerPhone", defaultValue: "" },
		{ key: "customerFax", defaultValue: "" },
		{ key: "customerTaxId", defaultValue: "" },
		// 聯絡人資料
		{ key: "contactName", defaultValue: "" },
		{ key: "contactPhone", defaultValue: "" },
		{ key: "contactGender", defaultValue: "先生" },
		{ key: "contactAddresss", defaultValue: "" },
		// 報價單資訊
		{ key: "orderType", defaultValue: "" },
		{ key: "quoteNumber", defaultValue: "" },
		{ key: "quoteDate", defaultValue: "" },
		{ key: "deadline", defaultValue: "" },
		{ key: "deliveryDate", defaultValue: "" },
		{ key: "deliveryDay", defaultValue: "" },
		{ key: "deliveryTime", defaultValue: "" },
		{ key: "deliveryStoreName", defaultValue: "" },
		{ key: "taxPercent", defaultValue: "0" },
		{ key: "remarks", defaultValue: "" },
		{ key: "validDays", defaultValue: "7" }
	];

	// 基本資料
	const data = {};
	
	// 從配置中獲取所有欄位並填充數據
	FORM_FIELDS.forEach(field => {
		const formKey = field.formKey || field.key;
		data[field.key] = formData.get(formKey) || field.defaultValue;
	});

	// 處理項目數據
	const { itemsHtml, subtotal, itemsJson } = processItemsData(formData);
	const taxPercent = parseFloat(data.taxPercent || "0");
	const taxAmount = Math.floor(subtotal * (taxPercent / 100));
	
	// 處理 Logo 轉換為 Base64
	let logoBase64 = "";
	try {
		logoBase64 = await convertImageToBase64(data.providerLogo);
	} catch (error) {
		console.error("Error converting logo to Base64:", error);
		if (data.providerLogo !== DEFAULT_LOGO_URL) {
			try { logoBase64 = await convertImageToBase64(DEFAULT_LOGO_URL); } 
			catch (fallbackError) { logoBase64 = data.providerLogo; }
		} else {
			logoBase64 = data.providerLogo;
		}
	}
	
	// 合併所有數據
	return {
		...data,
		logoBase64,
		itemsHtml,
		itemsJson: JSON.stringify(itemsJson), // 添加 JSON 格式的項目數據
		subtotalFormatted: formatNumber(subtotal),
		taxPercent,
		taxAmountFormatted: formatNumber(taxAmount),
		taxDisplay: taxPercent === 0 ? "內含" : formatNumber(taxAmount),
		totalFormatted: formatNumber(subtotal + taxAmount),
		remarks: processRemarks(data.remarks, data).replace(/\n/g, "<br>"),
		itemCount: formData.getAll("itemQuantity").length
	};
}

// 處理項目數據
function processItemsData(formData) {
	// 取得所有品項資料
	const itemDescriptions = formData.getAll("itemDescription");
	const itemQuantities = formData.getAll("itemQuantity");
	const itemUnitPrices = formData.getAll("itemUnitPrice");
	const itemNames = formData.getAll("itemName") || Array(Math.max(itemDescriptions.length, itemQuantities.length)).fill("");

	// 收集所有 itemType_ 開頭的欄位
	const itemTypes = [];
	for (const [key, value] of formData.entries()) {
		if (key.startsWith('itemType_')) itemTypes.push(value);
	}
	while (itemTypes.length < itemQuantities.length) itemTypes.push("現烤烤餅");

	// 生成項目 HTML 並計算小計
	let itemsHtml = "", subtotal = 0;
	const itemsJson = []; // 用於匯出 JSON
	
	for (let i = 0; i < itemQuantities.length; i++) {

		const desc = i < itemDescriptions.length ? itemDescriptions[i] : "";
		const name = i < itemNames.length ? itemNames[i] : "";
		const type = i < itemTypes.length ? itemTypes[i] : "現烤烤餅";
		const qty = Math.floor(parseFloat(itemQuantities[i]) || 0);
		const price = Math.floor(parseFloat(itemUnitPrices[i]) || 0);
		const lineTotal = qty * price;
		subtotal += lineTotal;
		
		// 添加到 JSON 數組
		itemsJson.push({
			type: type,
			name: name,
			desc: desc,
			qty: qty,
			price: price
		});
		
		// 交換品名和項目的顯示
		let displayName = type; // 品名顯示為烤餅類型
		let displayDesc = name; // 項目顯示為口味
		if (desc && desc.trim() !== "") displayDesc += " - " + desc;
		
		itemsHtml += `<tr>
			<td>${i + 1}</td>
			<td>${displayName}</td>
			<td>${displayDesc}</td>
			<td>${formatNumber(qty)}</td>
			<td>${formatNumber(price)}</td>
			<td>${formatNumber(lineTotal)}</td>
		</tr>`;
	}
	
	return { itemsHtml, subtotal, itemsJson };
}

// 處理備註內容
function processRemarks(remarks, data) {
	return remarks
		.replace(/{{deliveryDate}}/g, data.deliveryDate)
		.replace(/{{deliveryDay}}/g, data.deliveryDay)
		.replace(/{{deliveryTime}}/g, data.deliveryTime)
		.replace(/{{contactAddresss}}/g, data.contactAddresss)
		.replace(/{{deliveryStoreName}}/g, data.deliveryStoreName);
}

// 將數字轉為整數並以逗號分隔的格式，例如 25000 -> "25,000"
function formatNumber(num) {
	return Math.floor(num).toLocaleString('en-US');
}

// 簡單的模板替換函式，會把 {{key}} 替換成 data[key]
function templateReplace(template, data) {
	return template.replace(/{{\s*([\w]+)\s*}}/g, (match, key) => {
		return data[key] !== undefined ? data[key] : "";
	});
}

async function convertImageToBase64(url) {
	const response = await fetch(url);

	// 1) 狀態碼不是 2xx，就拋錯
	if (!response.ok) {
		throw new Error(`Failed to fetch image. Status: ${response.status} ${response.statusText}`);
	}

	// 2) 取得 Content-Type，若無就預設 "image/png"
	const contentType = response.headers.get("Content-Type") || "image/png";

	// 3) 黑名單檢查（若 Content-Type 含有 "text" 或 "html" 等就丟錯）
	const blackList = ["text", "html"];
	if (blackList.some(word => contentType.toLowerCase().includes(word))) {
		throw new Error(`Invalid Content-Type: ${contentType}`);
	}

	// 4) 轉 ArrayBuffer -> base64
	const buffer = await response.arrayBuffer();
	const base64 = arrayBufferToBase64(buffer);
	return `data:${contentType};base64,${base64}`;
}

function arrayBufferToBase64(buffer) {
	let binary = '';
	const bytes = new Uint8Array(buffer);
	const len = bytes.byteLength;
	for (let i = 0; i < len; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary);
}

// **反機器人與 IP 限制請求檢查**
async function checkForBots(request) {
	const userAgent = request.headers.get("User-Agent") || "";
	const clientIP = request.headers.get("CF-Connecting-IP") || "unknown";

	// 若檢測到機器人，返回 dict
	if (!userAgent || CONFIG.botPatterns.test(userAgent)) {
		return {
			status: 403,
			message: "Forbidden: Automated requests are not allowed",
			newCookie: ""
		};
	}

	// 檢查請求頻率
	const cookies = getCookies(request);
	const lastRequestData = cookies[clientIP] ? cookies[clientIP].split("|") : null;
	let requestCount = 1, firstRequestTime = Date.now();

	if (lastRequestData) {
		requestCount = parseInt(lastRequestData[0], 10);
		firstRequestTime = parseInt(lastRequestData[1], 10);

		if (Date.now() - firstRequestTime < CONFIG.timeWindow) {
			if (requestCount >= CONFIG.maxRequests) {
				// 超過請求頻率限制
				const randomIndex = Math.floor(Math.random() * CONFIG.hotComputerRoasts.length);
				const errorMessage = CONFIG.hotComputerRoasts[randomIndex];

				return {
					status: 429,
					message: errorMessage,
					newCookie: ""
				};
			}
			requestCount++;
		} else {
			// 超過時間窗口，重置計數
			requestCount = 1;
			firstRequestTime = Date.now();
		}
	}
	
	// 設置新的 Cookie（更新請求次數和時間戳）
	const newCookie = `${clientIP}=${requestCount}|${firstRequestTime}; Max-Age=60; Path=/; HttpOnly; Secure`;

	return {
		status: 200,
		message: "OK",
		newCookie
	};
}

// **輔助函數：解析 Cookie**
function getCookies(request) {
	const cookieHeader = request.headers.get("Cookie");
	if (!cookieHeader) return {};

	return Object.fromEntries(
		cookieHeader.split(";").map(cookie => {
			const [key, value] = cookie.trim().split("=");
			return [key, value];
		})
	);
}

// 處理 CORS 預檢請求
function handleCorsPreflightRequest() {
	return new Response(null, {
		status: 204,
		headers: {
			"Access-Control-Allow-Origin": "*",
			"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
			"Access-Control-Allow-Headers": "Content-Type",
			"Access-Control-Max-Age": "86400"
		}
	});
}
