import app from "./app";
import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import OAuthProvider from "@cloudflare/workers-oauth-provider";
import {
	CMPClient,
	getStateName,
	SIMUsageQuery,
	DataUsageDetail,
	EuiccPageQuery,
	EuiccPageDto,
	getProfileStatusName,
	getProfileTypeName,
} from "./cmp_client.js";

export class MyMCP extends McpAgent {
	server = new McpServer({
		name: "CMP SIM Management Server with OAuth",
		version: "1.0.0",
	});

	private cmpClient!: CMPClient;

	async init() {
		// Get environment variables from the Durable Object's env
		const env = this.env as unknown as Env & {
			CMP_API_KEY?: string;
			CMP_API_SECRET?: string;
			CMP_API_ENDPOINT?: string;
		};

		// Get environment variables
		const CMP_API_KEY = env.CMP_API_KEY;
		const CMP_API_SECRET = env.CMP_API_SECRET;
		const CMP_API_ENDPOINT =
			env.CMP_API_ENDPOINT || "https://cmp.acceleronix.io/gateway/openapi";

		// Validate required environment variables
		if (!CMP_API_KEY || !CMP_API_SECRET) {
			console.error("❌ Missing CMP API credentials");
			throw new Error(
				"Missing required environment variables: CMP_API_KEY and CMP_API_SECRET must be set in Cloudflare Workers.",
			);
		}

		console.log("✅ Environment variables loaded successfully");
		console.log("🔗 CMP Endpoint:", CMP_API_ENDPOINT);
		console.log("🔑 API Key configured:", CMP_API_KEY ? "✓" : "✗");
		console.log("🔐 API Secret configured:", CMP_API_SECRET ? "✓" : "✗");

		// Initialize CMP client with environment variables
		this.cmpClient = new CMPClient(
			CMP_API_KEY,
			CMP_API_SECRET,
			CMP_API_ENDPOINT,
		);

		console.log("📡 CMP Client initialized successfully");

		// Query SIM list tool
		this.server.tool(
			"query_sim_list",
			{
				pageNum: z.number().optional().describe("Page number, default 1"),
				pageSize: z
					.number()
					.optional()
					.describe("Records per page, default 10, max 1000"),
				enterpriseDataPlan: z
					.string()
					.optional()
					.describe("Enterprise data plan name"),
				expirationTimeStart: z
					.string()
					.optional()
					.describe("Start expiration date, format: yyyy-MM-dd"),
				expirationTimeEnd: z
					.string()
					.optional()
					.describe("End expiration date, format: yyyy-MM-dd"),
				iccidStart: z.string().optional().describe("ICCID start number"),
				iccidEnd: z.string().optional().describe("ICCID end number"),
				label: z.string().optional().describe("Label"),
				simState: z
					.number()
					.optional()
					.describe(
						"SIM state (2:Pre-activation 3:Test 4:Silent 5:Standby 6:Active 7:Shutdown 8:Pause 10:Pre-logout 11:Logout)",
					),
				simType: z.string().optional().describe("SIM card type"),
			},
			async (params) => {
				try {
					const response = await this.cmpClient.querySimList(params);

					if (response.code === 200) {
						const data = response.data;
						const simList = data.list || [];

						let result = `📊 SIM Query Results\n`;
						result += `├─ Current Page: ${data.current}\n`;
						result += `├─ Page Size: ${data.size}\n`;
						result += `├─ Total Pages: ${data.pages}\n`;
						result += `├─ Total Records: ${data.total}\n\n`;

						if (simList.length > 0) {
							result += `🔍 Found ${simList.length} SIM cards:\n`;
							simList.forEach((sim: any, index: number) => {
								result += `\n${index + 1}. 📱 ICCID: ${sim.iccid || "N/A"}\n`;
								result += `   ├─ IMSI: ${sim.imsi || "N/A"}\n`;
								result += `   ├─ MSISDN: ${sim.msisdn || "N/A"}\n`;
								result += `   ├─ Status: ${getStateName(sim.simState || 0)}\n`;
								result += `   ├─ Card Type: ${sim.simType || "N/A"}\n`;
								result += `   ├─ Enterprise: ${sim.enterprise || "N/A"}\n`;
								result += `   ├─ Data Plan: ${sim.enterpriseDataPlan || "N/A"}\n`;
								result += `   ├─ Activation Time: ${sim.activationTime || "N/A"}\n`;
								result += `   ├─ Expiration Time: ${sim.expirationTime || "N/A"}\n`;
								result += `   └─ Label: ${sim.label || "None"}\n`;
							});
						} else {
							result += "❌ No SIM cards found matching the criteria";
						}

						return { content: [{ type: "text", text: result }] };
					} else {
						return {
							content: [
								{
									type: "text",
									text: `❌ Query failed: ${response.msg || "Unknown error"}`,
								},
							],
						};
					}
				} catch (error) {
					return {
						content: [
							{
								type: "text",
								text: `❌ Failed to query SIM list: ${error instanceof Error ? error.message : "Unknown error"}`,
							},
						],
					};
				}
			},
		);

		// Query SIM detail tool
		this.server.tool(
			"query_sim_detail",
			{
				iccid: z.string().describe("SIM card ICCID number"),
			},
			async ({ iccid }) => {
				try {
					const response = await this.cmpClient.querySimDetail(iccid);

					if (response.code === 200) {
						const sim = response.data;

						let result = `📱 SIM Card Details\n`;
						result += `├─ SIM ID: ${sim.simId || "N/A"}\n`;
						result += `├─ ICCID: ${sim.iccid || "N/A"}\n`;
						result += `├─ MSISDN: ${sim.msisdn || "N/A"}\n`;
						result += `├─ IMEI: ${sim.imei || "N/A"}\n`;
						result += `├─ IMSI: ${sim.imsi || "N/A"}\n`;
						result += `├─ Enterprise: ${sim.enterprise || "N/A"}\n`;
						result += `├─ Label: ${sim.label || "None"}\n`;
						result += `├─ Status: ${getStateName(sim.simState || 0)}\n`;
						result += `├─ State Change Reason: ${sim.simStateChangeReason || "N/A"}\n`;
						result += `├─ Country/Region: ${sim.countryRegion || "N/A"}\n`;
						result += `├─ Operator Network: ${sim.operatorNetwork || "N/A"}\n`;
						result += `├─ Enterprise Data Plan: ${sim.enterpriseDataPlan || "N/A"}\n`;
						result += `├─ Network Type: ${sim.networkType || "N/A"}\n`;
						result += `├─ Card Type: ${sim.simType || "N/A"}\n`;
						result += `├─ APN: ${sim.apn || "N/A"}\n`;
						result += `├─ RAT: ${sim.rat || "N/A"}\n`;
						result += `├─ Initial Time: ${sim.initialTime || "N/A"}\n`;
						result += `├─ Activation Time: ${sim.activationTime || "N/A"}\n`;
						result += `├─ Expiration Time: ${sim.expirationTime || "N/A"}\n`;
						result += `├─ Last Session Time: ${sim.lastSessionTime || "N/A"}\n`;

						// Format data usage
						const dataUsage = sim.usedDataOfCurrentPeriod || 0;
						const usage =
							typeof dataUsage === "string"
								? parseInt(dataUsage) || 0
								: dataUsage;
						const formattedUsage = this.cmpClient.formatDataUsage(usage);
						result += `└─ Current Period Data Usage: ${formattedUsage}\n`;

						return { content: [{ type: "text", text: result }] };
					} else {
						return {
							content: [
								{
									type: "text",
									text: `❌ Query failed: ${response.msg || "Unknown error"}`,
								},
							],
						};
					}
				} catch (error) {
					return {
						content: [
							{
								type: "text",
								text: `❌ Failed to query SIM details: ${error instanceof Error ? error.message : "Unknown error"}`,
							},
						],
					};
				}
			},
		);

		// Query SIM usage details tool
		this.server.tool(
			"query_sim_usage",
			{
				iccid: z.string().describe("SIM card ICCID number"),
				month: z
					.string()
					.describe("Query month in yyyyMM format (e.g., 202301)"),
			},
			async ({ iccid, month }) => {
				try {
					const response = await this.cmpClient.querySimMonthData({
						iccid,
						month,
					});

					if (
						response.code === 200 ||
						(response.data && typeof response.data === "object")
					) {
						const usage = response.data;

						let result = `📊 SIM Usage Details\n`;
						result += `├─ ICCID: ${usage.iccid}\n`;
						result += `├─ Month: ${usage.month}\n`;
						result += `├─ Total Data Allowance: ${usage.totalDataAllowance} MB\n`;
						result += `├─ Total Data Usage: ${usage.totalDataUsage} MB\n`;
						result += `├─ Remaining Data: ${usage.remainingData} MB\n`;
						result += `├─ Outside Region Usage: ${usage.outsideRegionDataUsage} MB\n\n`;

						if (usage.dataUsageDetails && usage.dataUsageDetails.length > 0) {
							result += `📋 Usage Details:\n`;
							usage.dataUsageDetails.forEach(
								(detail: DataUsageDetail, index: number) => {
									const typeMap = {
										1: "Activation Period Plan",
										2: "Test Period Plan",
										3: "Data Package",
									};
									const typeName =
										typeMap[detail.type as keyof typeof typeMap] ||
										`Type ${detail.type}`;

									result += `\n${index + 1}. 📦 ${detail.orderName}\n`;
									result += `   ├─ Type: ${typeName}\n`;
									result += `   ├─ Allowance: ${detail.dataAllowance} MB\n`;
									result += `   ├─ Used: ${detail.dataUsage} MB\n`;
									result += `   └─ Outside Region: ${detail.outsideRegionDataUsage} MB\n`;
								},
							);
						} else {
							result += "❌ No detailed usage data available";
						}

						return { content: [{ type: "text", text: result }] };
					} else {
						return {
							content: [
								{
									type: "text",
									text: `❌ Query failed: ${response.msg || "Unknown error"}`,
								},
							],
						};
					}
				} catch (error) {
					return {
						content: [
							{
								type: "text",
								text: `❌ Failed to query SIM usage: ${error instanceof Error ? error.message : "Unknown error"}`,
							},
						],
					};
				}
			},
		);

		// Query eUICC list tool
		this.server.tool(
			"query_euicc_list",
			{
				pageNum: z.number().optional().describe("Page number, default 1"),
				pageSize: z
					.number()
					.optional()
					.describe("Records per page, default 10, max 1000"),
				childEnterpriseId: z
					.number()
					.optional()
					.describe("Child enterprise ID to filter"),
				iccid: z.string().optional().describe("ICCID filter"),
				profileStatus: z
					.number()
					.optional()
					.describe(
						"Profile status filter (1:Not downloaded, 2:Downloading, 3:Downloaded, 4:Enabling, 5:Enabled, 6:Disabling, 7:Disabled, 8:Deleting, 9:Deleted)",
					),
			},
			async (params) => {
				try {
					const response = await this.cmpClient.queryEuiccPage(params);

					if (
						response.code === 200 ||
						(response.data && typeof response.data === "object")
					) {
						const data = response.data.data || response.data;
						const euiccList = data.list || [];

						let result = `📡 eUICC List Results\n`;
						result += `├─ Request ID: ${response.reqId || "N/A"}\n`;
						result += `├─ Current Page: ${data.current || "N/A"}\n`;
						result += `├─ Page Size: ${data.size || "N/A"}\n`;
						result += `├─ Total Pages: ${data.pages || "N/A"}\n`;
						result += `├─ Total Records: ${data.total || "N/A"}\n\n`;

						if (euiccList.length > 0) {
							result += `🔍 Found ${euiccList.length} eUICC devices:\n`;

							euiccList.forEach((euicc: EuiccPageDto, index: number) => {
								result += `\n${index + 1}. 📱 eUICC Device\n`;
								result += `   ├─ eID: ${euicc.eid || "N/A"}\n`;
								result += `   ├─ ICCID: ${euicc.iccid || "N/A"}\n`;
								result += `   ├─ IMEI: ${euicc.imei || "N/A"}\n`;
								result += `   ├─ Enterprise: ${euicc.enterpriseName || "N/A"}\n`;
								result += `   ├─ Profile Number: ${euicc.profileNum || "N/A"}\n`;
								result += `   ├─ Profile Status: ${getProfileStatusName(euicc.profileStatus || 0)}\n`;
								result += `   ├─ Profile Type: ${getProfileTypeName(euicc.profileType || "0")}\n`;
								result += `   └─ Last Operation: ${euicc.lastOperateTime || "N/A"}\n`;
							});
						} else {
							result += "❌ No eUICC devices found matching the criteria";
						}

						return { content: [{ type: "text", text: result }] };
					} else {
						return {
							content: [
								{
									type: "text",
									text: `❌ Query failed: ${response.msg || "Unknown error"}`,
								},
							],
						};
					}
				} catch (error) {
					return {
						content: [
							{
								type: "text",
								text: `❌ Failed to query eUICC list: ${error instanceof Error ? error.message : "Unknown error"}`,
							},
						],
					};
				}
			},
		);
	}
}

// Export the OAuth handler as the default
export default new OAuthProvider({
	apiRoute: "/sse",
	// TODO: fix these types
	// @ts-expect-error
	apiHandler: MyMCP.mount("/sse"),
	// @ts-expect-error
	defaultHandler: app,
	authorizeEndpoint: "/authorize",
	tokenEndpoint: "/token",
	clientRegistrationEndpoint: "/register",
});
