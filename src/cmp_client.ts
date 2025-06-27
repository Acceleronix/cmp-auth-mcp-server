export enum SIMState {
	PRE_ACTIVATION = 2,
	TEST = 3,
	SILENT = 4,
	STANDBY = 5,
	ACTIVE = 6,
	SHUTDOWN = 7,
	PAUSE = 8,
	PRE_LOGOUT = 10,
	LOGOUT = 11,
}

export function getStateName(stateCode: number): string {
	const stateMap: Record<number, string> = {
		2: "Pre-activation",
		3: "Test",
		4: "Silent",
		5: "Standby",
		6: "Active",
		7: "Shutdown",
		8: "Pause",
		10: "Pre-logout",
		11: "Logout",
	};
	return stateMap[stateCode] || `Unknown status (${stateCode})`;
}

export interface SIMListQuery {
	pageNum?: number;
	pageSize?: number;
	enterpriseDataPlan?: string;
	expirationTimeStart?: string;
	expirationTimeEnd?: string;
	iccidStart?: string;
	iccidEnd?: string;
	label?: string;
	simState?: number;
	simType?: string;
}

export interface APIResponse<T = any> {
	code: number;
	msg?: string;
	reqId?: string;
	data: T;
}

export interface SIMUsageQuery {
	iccid: string;
	month: string; // yyyyMM format
}

export interface DataUsageDetail {
	dataAllowance: string; // Total data allowance in MB
	dataUsage: string; // Used data in MB
	orderName: string; // Order name
	outsideRegionDataUsage: string; // Outside region data usage in MB
	type: number; // 1: Activation period plan, 2: Test period plan, 3: Data package
}

export interface SIMUsageResponse {
	dataUsageDetails: DataUsageDetail[];
	iccid: string;
	month: string; // yyyyMM format
	outsideRegionDataUsage: string; // Outside region data usage in MB
	remainingData: string; // Remaining data in MB
	totalDataAllowance: string; // Total data allowance in MB
	totalDataUsage: string; // Total used data in MB
}

export interface EuiccPageQuery {
	childEnterpriseId?: number; // Child enterprise ID to query
	iccid?: string; // ICCID filter
	pageNum?: number; // Page number, default 1
	pageSize?: number; // Records per page, default 10, max 1000
	profileStatus?: number; // Profile status filter
}

export interface EuiccPageDto {
	eid: string; // eID
	enterpriseName: string; // Enterprise name
	iccid: string; // ICCID
	imei: string; // IMEI
	lastOperateTime: string; // Last operation time
	profileNum: number; // Profile number
	profileStatus: number; // Profile status: 1-9 (see enum below)
	profileType: string; // Profile type: 0=Test, 1=Provisioning, 2=Operational
}

export interface EuiccPageData {
	current: number; // Current page number
	extend: EuiccPageDto; // Extended field (seems to be sample data)
	list: EuiccPageDto[]; // Data list
	pages: number; // Total pages
	size: number; // Page size
	total: number; // Total records
}

export interface EuiccPageResponse {
	code: number;
	data: EuiccPageData;
	msg: string;
	reqId: string;
}

export enum ProfileStatus {
	NOT_DOWNLOADED = 1,
	DOWNLOADING = 2,
	DOWNLOADED = 3,
	ENABLING = 4,
	ENABLED = 5,
	DISABLING = 6,
	DISABLED = 7,
	DELETING = 8,
	DELETED = 9,
}

export function getProfileStatusName(status: number): string {
	const statusMap: Record<number, string> = {
		1: "Not Downloaded",
		2: "Downloading",
		3: "Downloaded",
		4: "Enabling",
		5: "Enabled",
		6: "Disabling",
		7: "Disabled",
		8: "Deleting",
		9: "Deleted",
	};
	return statusMap[status] || `Unknown Status (${status})`;
}

export function getProfileTypeName(type: string): string {
	const typeMap: Record<string, string> = {
		"0": "Test Profile",
		"1": "Provisioning Profile",
		"2": "Operational Profile",
	};
	return typeMap[type] || `Unknown Type (${type})`;
}

export class CMPClient {
	private appKey: string;
	private appSecret: string;
	private endpoint: string;

	constructor(appKey: string, appSecret: string, endpoint: string) {
		this.appKey = appKey;
		this.appSecret = appSecret;
		this.endpoint = endpoint.replace(/\/$/, "");
	}

	private async generateSignature(
		timestamp: number,
		requestBody = "",
	): Promise<string> {
		const signContent = this.appKey + timestamp.toString() + requestBody;
		const encoder = new TextEncoder();
		const keyData = encoder.encode(this.appSecret);
		const messageData = encoder.encode(signContent);

		const cryptoKey = await crypto.subtle.importKey(
			"raw",
			keyData,
			{ name: "HMAC", hash: "SHA-256" },
			false,
			["sign"],
		);

		const signature = await crypto.subtle.sign("HMAC", cryptoKey, messageData);
		return Array.from(new Uint8Array(signature))
			.map((b) => b.toString(16).padStart(2, "0"))
			.join("");
	}

	private async getHeaders(requestBody = ""): Promise<Record<string, string>> {
		const timestamp = Math.floor(Date.now() / 1000);
		const signature = await this.generateSignature(timestamp, requestBody);

		return {
			"Content-Type": "application/json",
			"APP-Key": this.appKey,
			Signature: signature,
			Timestamp: timestamp.toString(),
		};
	}

	private async makeRequest<T = any>(
		method: string,
		resourcePath: string,
		data?: any,
		params?: Record<string, any>,
	): Promise<APIResponse<T>> {
		const baseUrl = this.endpoint.endsWith("/")
			? this.endpoint.slice(0, -1)
			: this.endpoint;
		const path = resourcePath.startsWith("/")
			? resourcePath.slice(1)
			: resourcePath;
		const url = new URL(`${baseUrl}/${path}`);

		if (params) {
			for (const [key, value] of Object.entries(params)) {
				if (value !== undefined && value !== null) {
					url.searchParams.append(key, String(value));
				}
			}
		}

		const requestBody = data ? JSON.stringify(data) : "";
		const headers = await this.getHeaders(requestBody);

		console.log(`🔍 Making ${method} request to: ${url.toString()}`);
		console.log(`📊 Request body: ${requestBody}`);
		console.log(`🔑 Headers: ${JSON.stringify(headers)}`);

		try {
			const response = await fetch(url.toString(), {
				method,
				headers,
				body: requestBody || undefined,
			});

			console.log(
				`📡 Response status: ${response.status} ${response.statusText}`,
			);

			if (!response.ok) {
				const responseText = await response.text();
				console.log(`❌ Response body: ${responseText}`);
				throw new Error(
					`HTTP Error: ${response.status} ${response.statusText}`,
				);
			}

			const result: APIResponse<T> = await response.json();
			console.log(`📋 Response data: ${JSON.stringify(result)}`);

			if (result.code === undefined) {
				if (typeof result === "object" && result !== null) {
					console.log(
						`⚠️ API returned data without standard wrapper, treating as success`,
					);
					return {
						code: 200,
						msg: "OK",
						data: result as T,
					} as APIResponse<T>;
				} else {
					throw new Error(
						`API Error: Invalid response format - ${JSON.stringify(result)}`,
					);
				}
			}

			if (result.code !== 200) {
				throw new Error(
					`API Error [${result.code}]: ${result.msg || "Unknown error"}`,
				);
			}

			return result;
		} catch (error) {
			if (error instanceof Error) {
				throw new Error(`Request failed: ${error.message}`);
			}
			throw new Error("Request failed: Unknown error");
		}
	}

	async get<T = any>(
		resourcePath: string,
		params?: Record<string, any>,
	): Promise<APIResponse<T>> {
		return this.makeRequest<T>("GET", resourcePath, undefined, params);
	}

	async post<T = any>(
		resourcePath: string,
		data?: any,
	): Promise<APIResponse<T>> {
		return this.makeRequest<T>("POST", resourcePath, data);
	}

	async put<T = any>(
		resourcePath: string,
		data?: any,
	): Promise<APIResponse<T>> {
		return this.makeRequest<T>("PUT", resourcePath, data);
	}

	async delete<T = any>(
		resourcePath: string,
		data?: any,
	): Promise<APIResponse<T>> {
		return this.makeRequest<T>("DELETE", resourcePath, data);
	}

	async querySimList(options: SIMListQuery = {}): Promise<APIResponse> {
		const {
			pageNum = 1,
			pageSize = 10,
			enterpriseDataPlan,
			expirationTimeStart,
			expirationTimeEnd,
			iccidStart,
			iccidEnd,
			label,
			simState,
			simType,
		} = options;

		const data: Record<string, any> = {
			pageNum,
			pageSize: Math.min(pageSize, 1000),
		};

		if (enterpriseDataPlan) data.enterpriseDataPlan = enterpriseDataPlan;
		if (expirationTimeStart) data.expirationTimeStart = expirationTimeStart;
		if (expirationTimeEnd) data.expirationTimeEnd = expirationTimeEnd;
		if (iccidStart) data.iccidStart = iccidStart;
		if (iccidEnd) data.iccidEnd = iccidEnd;
		if (label) data.label = label;
		if (simState !== undefined) data.simState = simState;
		if (simType) data.simType = simType;

		return this.post("/sim/page", data);
	}

	async querySimDetail(iccid: string): Promise<APIResponse> {
		if (!iccid || !iccid.trim()) {
			throw new Error("ICCID cannot be empty");
		}

		return this.post("/sim/detail", { iccid: iccid.trim() });
	}

	async querySimMonthData(
		options: SIMUsageQuery,
	): Promise<APIResponse<SIMUsageResponse>> {
		const { iccid, month } = options;

		if (!iccid || !iccid.trim()) {
			throw new Error("ICCID cannot be empty");
		}

		if (!month || !month.trim()) {
			throw new Error("Month cannot be empty");
		}

		if (!/^\d{6}$/.test(month.trim())) {
			throw new Error("Month format must be yyyyMM (e.g., 202301)");
		}

		return this.post("/sim/queryMonthData", {
			iccid: iccid.trim(),
			month: month.trim(),
		});
	}

	async queryEuiccPage(
		options: EuiccPageQuery = {},
	): Promise<APIResponse<EuiccPageResponse>> {
		const {
			childEnterpriseId,
			iccid,
			pageNum = 1,
			pageSize = 10,
			profileStatus,
		} = options;

		const data: Record<string, any> = {
			pageNum,
			pageSize: Math.min(pageSize, 1000),
		};

		if (childEnterpriseId !== undefined)
			data.childEnterpriseId = childEnterpriseId;
		if (iccid && iccid.trim()) data.iccid = iccid.trim();
		if (profileStatus !== undefined) data.profileStatus = profileStatus;

		if (
			profileStatus !== undefined &&
			(profileStatus < 1 || profileStatus > 9)
		) {
			throw new Error(
				"Profile status must be between 1-9 (see ProfileStatus enum)",
			);
		}

		return this.post("/esim/euicc/page", data);
	}

	formatDataUsage(bytesValue: number): string {
		if (bytesValue === 0) return "0 B";

		const units = ["B", "KB", "MB", "GB", "TB"];
		let size = bytesValue;
		let unitIndex = 0;

		while (size >= 1024 && unitIndex < units.length - 1) {
			size /= 1024;
			unitIndex++;
		}

		if (unitIndex === 0) {
			return `${Math.round(size)} ${units[unitIndex]}`;
		}
		return `${size.toFixed(2)} ${units[unitIndex]}`;
	}
}
