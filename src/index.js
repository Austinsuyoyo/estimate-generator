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
		const botCheck = await checkForBots(request);
		if (botCheck.status !== 200) return new Response(botCheck.message, { status: botCheck.status });
		if (request.method === "OPTIONS") return handleCorsPreflightRequest();

		const response = request.method === "GET" 
			? new Response(formHtml, { headers: { "Content-Type": "text/html; charset=utf-8" } })
			: await handlePostRequest(request);
		
		if (botCheck.newCookie) response.headers.append("Set-Cookie", botCheck.newCookie);
		return response;
	}
};

async function handlePostRequest(request) {
	const { isValid, errorResponse } = validateRequestSource(request);
	if (!isValid) return errorResponse;

	const formData = await request.formData();
	const processedData = await processFormData(formData);
	const outputHtml = templateReplace(quoteTemplate, processedData);
	return new Response(outputHtml, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

function validateRequestSource(request) {
	const refererHeader = request.headers.get("Referer") || "";
	const cookies = getCookies(request);
	const clientIP = request.headers.get("CF-Connecting-IP") || "unknown";
	const lastRequestData = cookies[clientIP] ? cookies[clientIP].split("|") : null;

	if (!refererHeader || !lastRequestData) {
		const errorMessage = CONFIG.hotComputerRoasts[Math.floor(Math.random() * CONFIG.hotComputerRoasts.length)];
		return { isValid: false, errorResponse: new Response(errorMessage, { status: 400 }) };
	}
	return { isValid: true };
}

async function processFormData(formData) {
	const FORM_FIELDS = [
		{ key: "providerLogo", defaultValue: DEFAULT_LOGO_URL },
		{ key: "providerName", defaultValue: "" }, { key: "providerAddress", defaultValue: "" },
		{ key: "providerPhone", defaultValue: "" }, { key: "providerStaffName", defaultValue: "" },
		{ key: "customerName", defaultValue: "" }, { key: "customerAddress", defaultValue: "" },
		{ key: "customerPhone", defaultValue: "" }, { key: "customerFax", defaultValue: "" },
		{ key: "customerTaxId", defaultValue: "" }, { key: "contactName", defaultValue: "" },
		{ key: "contactPhone", defaultValue: "" }, { key: "contactGender", defaultValue: "先生" },
		{ key: "contactAddresss", defaultValue: "" }, { key: "orderType", defaultValue: "" },
		{ key: "quoteNumber", defaultValue: "" }, { key: "quoteDate", defaultValue: "" },
		{ key: "deadline", defaultValue: "" }, { key: "deliveryDate", defaultValue: "" },
		{ key: "deliveryDay", defaultValue: "" }, { key: "deliveryTime", defaultValue: "" },
		{ key: "deliveryStoreName", defaultValue: "" }, { key: "taxPercent", defaultValue: "0" },
		{ key: "remarks", defaultValue: "" }, { key: "validDays", defaultValue: "7" }
	];

	const data = {};
	FORM_FIELDS.forEach(field => data[field.key] = formData.get(field.formKey || field.key) || field.defaultValue);

	const { itemsHtml, subtotal, itemsJson } = processItemsData(formData);
	const taxPercent = parseFloat(data.taxPercent || "0");
	const taxAmount = Math.floor(subtotal * (taxPercent / 100));
	
	let logoBase64 = "";
	try {
		logoBase64 = await convertImageToBase64(data.providerLogo);
	} catch (error) {
		console.error("Error converting logo to Base64:", error);
		logoBase64 = data.providerLogo !== DEFAULT_LOGO_URL 
			? await convertImageToBase64(DEFAULT_LOGO_URL).catch(() => data.providerLogo)
			: data.providerLogo;
	}
	
	return {
		...data, logoBase64, itemsHtml, itemsJson: JSON.stringify(itemsJson),
		subtotalFormatted: formatNumber(subtotal), taxPercent,
		taxAmountFormatted: formatNumber(taxAmount),
		taxDisplay: taxPercent === 0 ? "內含" : formatNumber(taxAmount),
		totalFormatted: formatNumber(subtotal + taxAmount),
		remarks: processRemarks(data.remarks, data).replace(/\n/g, "<br>"),
		itemCount: formData.getAll("itemQuantity").length
	};
}

function processItemsData(formData) {
	const itemsMap = new Map();
	
	for (const [key, value] of formData.entries()) {
		if (key.startsWith('item_')) {
			const parts = key.split('_');
			if (parts.length >= 3) {
				const id = parts[1];
				const fieldName = parts.slice(2).join('_');
				if (!itemsMap.has(id)) itemsMap.set(id, {});
				itemsMap.get(id)[fieldName] = value;
			}
		}
	}
	
	const itemsArray = Array.from(itemsMap.values());
	let itemsHtml = "", subtotal = 0;
	const itemsJson = [];
	
	itemsArray.forEach((item, index) => {
		const type = item.type || "現烤烤餅";
		const name = item.name || "";
		const desc = item.description || "";
		const qty = Math.floor(parseFloat(item.quantity) || 0);
		const price = Math.floor(parseFloat(item.price) || 0);
		const lineTotal = qty * price;
		subtotal += lineTotal;
		
		const jsonItem = { type, name, desc, qty, price };
		if (type === '飲料') {
			jsonItem.customOptions = {
				sweetness: item.sweetness || '',
				temperature: item.temperature || ''
			};
		}
		
		itemsJson.push(jsonItem);
		
		let displayDesc = name;
		if (desc && desc.trim() !== "") displayDesc += " - " + desc;
		
		itemsHtml += `<tr><td>${index + 1}</td><td>${type}</td><td>${displayDesc}</td>
			<td>${formatNumber(qty)}</td><td>${formatNumber(price)}</td>
			<td>${formatNumber(lineTotal)}</td></tr>`;
	});
	
	return { itemsHtml, subtotal, itemsJson };
}

function processRemarks(remarks, data) {
	return remarks
		.replace(/{{deliveryDate}}/g, data.deliveryDate)
		.replace(/{{deliveryDay}}/g, data.deliveryDay)
		.replace(/{{deliveryTime}}/g, data.deliveryTime)
		.replace(/{{contactAddresss}}/g, data.contactAddresss)
		.replace(/{{deliveryStoreName}}/g, data.deliveryStoreName);
}

function formatNumber(num) {
	return Math.floor(num).toLocaleString('en-US');
}

function templateReplace(template, data) {
	return template.replace(/{{\s*([\w]+)\s*}}/g, (match, key) => data[key] !== undefined ? data[key] : "");
}

async function convertImageToBase64(url) {
	const response = await fetch(url);
	if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`);
	
	const contentType = response.headers.get("Content-Type") || "image/png";
	if (["text", "html"].some(word => contentType.toLowerCase().includes(word)))
		throw new Error(`Invalid Content-Type: ${contentType}`);
	
	const buffer = await response.arrayBuffer();
	const base64 = btoa([...new Uint8Array(buffer)].map(b => String.fromCharCode(b)).join(''));
	return `data:${contentType};base64,${base64}`;
}

async function checkForBots(request) {
	const userAgent = request.headers.get("User-Agent") || "";
	const clientIP = request.headers.get("CF-Connecting-IP") || "unknown";

	if (!userAgent || CONFIG.botPatterns.test(userAgent)) {
		return { status: 403, message: "Forbidden: Automated requests are not allowed", newCookie: "" };
	}

	const cookies = getCookies(request);
	const lastRequestData = cookies[clientIP] ? cookies[clientIP].split("|") : null;
	let requestCount = 1, firstRequestTime = Date.now();

	if (lastRequestData) {
		requestCount = parseInt(lastRequestData[0], 10);
		firstRequestTime = parseInt(lastRequestData[1], 10);

		if (Date.now() - firstRequestTime < CONFIG.timeWindow) {
			if (requestCount >= CONFIG.maxRequests) {
				const errorMessage = CONFIG.hotComputerRoasts[Math.floor(Math.random() * CONFIG.hotComputerRoasts.length)];
				return { status: 429, message: errorMessage, newCookie: "" };
			}
			requestCount++;
		} else {
			requestCount = 1;
			firstRequestTime = Date.now();
		}
	}
	
	return {
		status: 200, message: "OK",
		newCookie: `${clientIP}=${requestCount}|${firstRequestTime}; Max-Age=60; Path=/; HttpOnly; Secure`
	};
}

function getCookies(request) {
	const cookieHeader = request.headers.get("Cookie");
	if (!cookieHeader) return {};
	return Object.fromEntries(cookieHeader.split(";").map(cookie => {
		const [key, value] = cookie.trim().split("=");
		return [key, value];
	}));
}

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
