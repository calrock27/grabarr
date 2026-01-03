import parser from "cron-parser";

export function getNextRunDate(cron: string): Date | null {
    if (!cron) return null;
    try {
        // Handle potential CJS/ESM interop issues
        const p: any = parser;
        let expression: any;

        // 1. Try named export generic (if import * used, but we used default)

        // 2. parser is likely the CronExpressionParser Class if default export is class
        if (p.parse) {
            expression = p.parse(cron);
        }
        // 3. parser.default might be the class
        else if (p.default && p.default.parse) {
            expression = p.default.parse(cron);
        }
        // 4. old style parseExpression
        else if (p.parseExpression) {
            expression = p.parseExpression(cron);
        }
        else if (p.default && p.default.parseExpression) {
            expression = p.default.parseExpression(cron);
        }

        if (expression) {
            return expression.next().toDate();
        }
        return null;
    } catch (e) {
        console.error("Cron parse error", e);
        return null;
    }
}
