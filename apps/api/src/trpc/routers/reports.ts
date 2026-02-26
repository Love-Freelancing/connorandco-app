import {
  createReportSchema,
  getBurnRateSchema,
  getChartDataByLinkIdSchema,
  getExpensesSchema,
  getProfitSchema,
  getReportByLinkIdSchema,
  getRevenueForecastSchema,
  getRevenueSchema,
  getRunwaySchema,
  getSpendingSchema,
  getTaxSummarySchema,
} from "@api/schemas/reports";
import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "@api/trpc/init";
import {
  InvalidReportTypeError,
  ReportExpiredError,
  ReportNotFoundError,
} from "@connorco/db/errors";
import {
  createReport,
  getBurnRate,
  getChartDataByLinkId,
  getExpenses,
  getReportByLinkId,
  getReports,
  getRevenueForecast,
  getRunway,
  getSpending,
  getTaxSummary,
} from "@connorco/db/queries";
import { createLoggerWithContext } from "@connorco/logger";
import { TRPCError } from "@trpc/server";

const logger = createLoggerWithContext("trpc:reports");

function getFallbackCurrency(currency?: string) {
  return currency ?? "USD";
}

function getEmptyReportsResponse(
  type: "revenue" | "profit",
  currency?: string,
) {
  const fallbackCurrency = getFallbackCurrency(currency);

  return {
    summary: {
      currentTotal: 0,
      prevTotal: 0,
      currency: fallbackCurrency,
    },
    meta: {
      type,
      currency: fallbackCurrency,
    },
    result: [],
  };
}

function getEmptyExpensesResponse(currency?: string) {
  const fallbackCurrency = getFallbackCurrency(currency);

  return {
    summary: {
      averageExpense: 0,
      currency: fallbackCurrency,
    },
    meta: {
      type: "expense",
      currency: fallbackCurrency,
    },
    result: [],
  };
}

function getEmptyRevenueForecastResponse(params: {
  currency?: string;
  revenueType?: "gross" | "net";
  forecastMonths: number;
}) {
  const fallbackCurrency = getFallbackCurrency(params.currency);

  return {
    summary: {
      nextMonthProjection: 0,
      avgMonthlyGrowthRate: 0,
      totalProjectedRevenue: 0,
      peakMonth: {
        date: "",
        value: 0,
      },
      currency: fallbackCurrency,
      revenueType: params.revenueType ?? "net",
      forecastStartDate: undefined,
      unpaidInvoices: {
        count: 0,
        totalAmount: 0,
        currency: fallbackCurrency,
      },
      billableHours: {
        totalHours: 0,
        totalAmount: 0,
        currency: fallbackCurrency,
      },
    },
    historical: [],
    forecast: [],
    combined: [],
    meta: {
      historicalMonths: 0,
      forecastMonths: params.forecastMonths,
      avgGrowthRate: 0,
      basedOnMonths: 0,
      currency: fallbackCurrency,
      includesUnpaidInvoices: false,
      includesBillableHours: false,
      forecastMethod: "bottom_up",
      confidenceScore: 0,
      warnings: [],
      recurringRevenueTotal: 0,
      recurringInvoicesCount: 0,
      recurringTransactionsCount: 0,
      scheduledInvoicesTotal: 0,
    },
  };
}

export const reportsRouter = createTRPCRouter({
  revenue: protectedProcedure
    .input(getRevenueSchema)
    .query(async ({ ctx: { db, teamId }, input }) => {
      try {
        return await getReports(db, {
          teamId: teamId!,
          from: input.from,
          to: input.to,
          currency: input.currency,
          type: "revenue",
          revenueType: input.revenueType,
        });
      } catch (error) {
        logger.error("Failed to fetch revenue report", {
          teamId,
          from: input.from,
          to: input.to,
          currency: input.currency,
          error: error instanceof Error ? error.message : String(error),
        });

        return getEmptyReportsResponse("revenue", input.currency);
      }
    }),

  profit: protectedProcedure
    .input(getProfitSchema)
    .query(async ({ ctx: { db, teamId }, input }) => {
      try {
        return await getReports(db, {
          teamId: teamId!,
          from: input.from,
          to: input.to,
          currency: input.currency,
          type: "profit",
          revenueType: input.revenueType,
        });
      } catch (error) {
        logger.error("Failed to fetch profit report", {
          teamId,
          from: input.from,
          to: input.to,
          currency: input.currency,
          error: error instanceof Error ? error.message : String(error),
        });

        return getEmptyReportsResponse("profit", input.currency);
      }
    }),

  burnRate: protectedProcedure
    .input(getBurnRateSchema)
    .query(async ({ ctx: { db, teamId }, input }) => {
      try {
        return await getBurnRate(db, {
          teamId: teamId!,
          from: input.from,
          to: input.to,
          currency: input.currency,
        });
      } catch (error) {
        logger.error("Failed to fetch burn rate report", {
          teamId,
          from: input.from,
          to: input.to,
          currency: input.currency,
          error: error instanceof Error ? error.message : String(error),
        });

        return [];
      }
    }),

  runway: protectedProcedure
    .input(getRunwaySchema)
    .query(async ({ ctx: { db, teamId }, input }) => {
      try {
        return await getRunway(db, {
          teamId: teamId!,
          currency: input.currency,
        });
      } catch (error) {
        logger.error("Failed to fetch runway report", {
          teamId,
          currency: input.currency,
          error: error instanceof Error ? error.message : String(error),
        });

        return 0;
      }
    }),

  expense: protectedProcedure
    .input(getExpensesSchema)
    .query(async ({ ctx: { db, teamId }, input }) => {
      try {
        return await getExpenses(db, {
          teamId: teamId!,
          from: input.from,
          to: input.to,
          currency: input.currency,
        });
      } catch (error) {
        logger.error("Failed to fetch expense report", {
          teamId,
          from: input.from,
          to: input.to,
          currency: input.currency,
          error: error instanceof Error ? error.message : String(error),
        });

        return getEmptyExpensesResponse(input.currency);
      }
    }),

  spending: protectedProcedure
    .input(getSpendingSchema)
    .query(async ({ ctx: { db, teamId }, input }) => {
      try {
        return await getSpending(db, {
          teamId: teamId!,
          from: input.from,
          to: input.to,
          currency: input.currency,
        });
      } catch (error) {
        logger.error("Failed to fetch spending report", {
          teamId,
          from: input.from,
          to: input.to,
          currency: input.currency,
          error: error instanceof Error ? error.message : String(error),
        });

        return [];
      }
    }),

  taxSummary: protectedProcedure
    .input(getTaxSummarySchema)
    .query(async ({ ctx: { db, teamId }, input }) => {
      return getTaxSummary(db, {
        teamId: teamId!,
        from: input.from,
        to: input.to,
        currency: input.currency,
        type: input.type,
        categorySlug: input.categorySlug,
        taxType: input.taxType,
      });
    }),

  revenueForecast: protectedProcedure
    .input(getRevenueForecastSchema)
    .query(async ({ ctx: { db, teamId }, input }) => {
      try {
        return await getRevenueForecast(db, {
          teamId: teamId!,
          from: input.from,
          to: input.to,
          forecastMonths: input.forecastMonths,
          currency: input.currency,
          revenueType: input.revenueType,
        });
      } catch (error) {
        logger.error("Failed to fetch revenue forecast report", {
          teamId,
          from: input.from,
          to: input.to,
          forecastMonths: input.forecastMonths,
          currency: input.currency,
          revenueType: input.revenueType,
          error: error instanceof Error ? error.message : String(error),
        });

        return getEmptyRevenueForecastResponse({
          currency: input.currency,
          revenueType: input.revenueType,
          forecastMonths: input.forecastMonths,
        });
      }
    }),

  create: protectedProcedure
    .input(createReportSchema)
    .mutation(async ({ ctx: { db, teamId, session }, input }) => {
      const result = await createReport(db, {
        type: input.type,
        from: input.from,
        to: input.to,
        currency: input.currency,
        teamId: teamId!,
        createdBy: session.user.id,
        expireAt: input.expireAt,
      });

      return {
        ...result,
        shortUrl: `${process.env.CONNORCO_DASHBOARD_URL}/r/${result?.linkId}`,
      };
    }),

  getByLinkId: publicProcedure
    .input(getReportByLinkIdSchema)
    .query(async ({ ctx: { db }, input }) => {
      return getReportByLinkId(db, input.linkId);
    }),

  getChartDataByLinkId: publicProcedure
    .input(getChartDataByLinkIdSchema)
    .query(async ({ ctx: { db }, input }) => {
      try {
        return await getChartDataByLinkId(db, input.linkId);
      } catch (error: unknown) {
        if (error instanceof ReportNotFoundError) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: error.message,
          });
        }
        if (error instanceof ReportExpiredError) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: error.message,
          });
        }
        if (error instanceof InvalidReportTypeError) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: error.message,
          });
        }
        throw error;
      }
    }),
});
