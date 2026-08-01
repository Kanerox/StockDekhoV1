const {
  fetchAnnualIncomeStatement,
  fetchAnnualBalanceSheet,
  fetchAnnualCashFlow,
} = require("../clients/financialsClient");

function getYear(record) {
  if (!record?.date) return null;

  const date = new Date(record.date);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.getUTCFullYear();
}

function valueOrNull(value) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : null;
}

function normalizeIncomeStatement(record) {
  return {
    year: getYear(record),
    periodType: record.periodType || null,

    revenue: valueOrNull(
      record.totalRevenue ?? record.operatingRevenue
    ),

    grossProfit: valueOrNull(record.grossProfit),
    operatingIncome: valueOrNull(record.operatingIncome),
    ebit: valueOrNull(record.EBIT),
    ebitda: valueOrNull(record.EBITDA),

    operatingExpenses: valueOrNull(
      record.operatingExpense
    ),

    interestExpense: valueOrNull(
      record.interestExpense ??
        record.interestExpenseNonOperating
    ),

    pretaxIncome: valueOrNull(record.pretaxIncome),
    taxProvision: valueOrNull(record.taxProvision),

    netIncome: valueOrNull(
      record.netIncome ??
        record.netIncomeCommonStockholders
    ),

    basicEPS: valueOrNull(record.basicEPS),
    dilutedEPS: valueOrNull(record.dilutedEPS),
  };
}

function normalizeBalanceSheet(record) {
  return {
    year: getYear(record),
    periodType: record.periodType || null,

    totalAssets: valueOrNull(record.totalAssets),

    totalLiabilities: valueOrNull(
      record.totalLiabilitiesNetMinorityInterest
    ),

    shareholdersEquity: valueOrNull(
      record.stockholdersEquity ??
        record.commonStockEquity
    ),

    totalEquityIncludingMinorityInterest: valueOrNull(
      record.totalEquityGrossMinorityInterest
    ),

    cashAndEquivalents: valueOrNull(
      record.cashAndCashEquivalents
    ),

    cashAndShortTermInvestments: valueOrNull(
      record.cashCashEquivalentsAndShortTermInvestments
    ),

    totalDebt: valueOrNull(record.totalDebt),
    netDebt: valueOrNull(record.netDebt),

    currentAssets: valueOrNull(record.currentAssets),
    currentLiabilities: valueOrNull(
      record.currentLiabilities
    ),

    workingCapital: valueOrNull(record.workingCapital),
    inventory: valueOrNull(record.inventory),

    accountsReceivable: valueOrNull(
      record.accountsReceivable
    ),

    accountsPayable: valueOrNull(record.accountsPayable),
    netPPE: valueOrNull(record.netPPE),

    goodwillAndIntangibles: valueOrNull(
      record.goodwillAndOtherIntangibleAssets
    ),
  };
}

function normalizeCashFlow(record) {
  return {
    year: getYear(record),
    periodType: record.periodType || null,

    operatingCashFlow: valueOrNull(
      record.operatingCashFlow
    ),

    capitalExpenditure: valueOrNull(
      record.capitalExpenditure ??
        record.capitalExpenditureReported
    ),

    freeCashFlow: valueOrNull(record.freeCashFlow),

    investingCashFlow: valueOrNull(
      record.investingCashFlow
    ),

    financingCashFlow: valueOrNull(
      record.financingCashFlow
    ),

    dividendsPaid: valueOrNull(
      record.cashDividendsPaid
    ),

    debtIssued: valueOrNull(record.issuanceOfDebt),
    debtRepaid: valueOrNull(record.repaymentOfDebt),

    beginningCashPosition: valueOrNull(
      record.beginningCashPosition
    ),

    endingCashPosition: valueOrNull(
      record.endCashPosition
    ),

    changeInCash: valueOrNull(record.changesInCash),
  };
}

function prepareStatement(records, normalizer) {
  return records
    .map(normalizer)
    .filter((record) => record.year !== null)
    .sort((recordA, recordB) => recordA.year - recordB.year);
}

async function getCompanyFinancials(symbol) {
  const [
    rawIncomeStatement,
    rawBalanceSheet,
    rawCashFlow,
  ] = await Promise.all([
    fetchAnnualIncomeStatement(symbol),
    fetchAnnualBalanceSheet(symbol),
    fetchAnnualCashFlow(symbol),
  ]);

  const incomeStatement = prepareStatement(
    rawIncomeStatement,
    normalizeIncomeStatement
  );

  const balanceSheet = prepareStatement(
    rawBalanceSheet,
    normalizeBalanceSheet
  );

  const cashFlow = prepareStatement(
    rawCashFlow,
    normalizeCashFlow
  );

  return {
    symbol: symbol.trim().toUpperCase(),
    currency: "INR",
    frequency: "annual",
    units: "absolute",

    incomeStatement,
    balanceSheet,
    cashFlow,
  };
}

module.exports = {
  getCompanyFinancials,
};