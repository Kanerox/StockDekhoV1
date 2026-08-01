const {
  fetchAnnualIncomeStatement,
  fetchAnnualBalanceSheet,
  fetchAnnualCashFlow,
} = require("./clients/financialsClient");

async function testFinancials() {
  try {
    const symbol = "RELIANCE";

    const [incomeStatement, balanceSheet, cashFlow] =
      await Promise.all([
        fetchAnnualIncomeStatement(symbol),
        fetchAnnualBalanceSheet(symbol),
        fetchAnnualCashFlow(symbol),
      ]);

    console.log("\nINCOME STATEMENT\n");
    console.dir(incomeStatement.slice(-2), {
      depth: null,
    });

    console.log("\nBALANCE SHEET\n");
    console.dir(balanceSheet.slice(-2), {
      depth: null,
    });

    console.log("\nCASH FLOW\n");
    console.dir(cashFlow.slice(-2), {
      depth: null,
    });
  } catch (error) {
    console.error("Financial data test failed:");
    console.error(error);
  }
}

testFinancials();