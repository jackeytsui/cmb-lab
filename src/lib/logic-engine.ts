import { LogicRule } from "@/types/video-thread-player";

type ContextData = {
    answer?: {
        type: string;
        content: string | number | boolean;
    };
    student?: {
        tags?: string[];
        email?: string;
    };
    session?: Record<string, any>;
};

export function evaluateRules(rules: LogicRule[], context: ContextData): string | null {
    for (const rule of rules) {
        if (evaluateRule(rule, context)) {
            return rule.nextStepId;
        }
    }
    return null;
}

function evaluateRule(rule: LogicRule, context: ContextData): boolean {
    const fieldValue = getField(context, rule.field);
    const targetValue = rule.value;

    switch (rule.operator) {
        case 'equals':
            return String(fieldValue) === String(targetValue);
        case 'contains':
            return String(fieldValue).toLowerCase().includes(String(targetValue).toLowerCase());
        case 'exists':
            return fieldValue !== undefined && fieldValue !== null && fieldValue !== "";
        case 'gt':
            return Number(fieldValue) > Number(targetValue);
        case 'lt':
            return Number(fieldValue) < Number(targetValue);
        default:
            return false;
    }
}

function getField(obj: any, path: string): any {
    if (!path) return undefined;

    // Accept n8n-style expressions like {{$json.answer.content}} in addition to plain paths.
    const expressionMatch = path.match(/^\s*\{\{\s*\$json\.([^}]+)\s*\}\}\s*$/);
    const normalizedPath = (expressionMatch?.[1] ?? path).trim();

    return normalizedPath
        .split(".")
        .filter(Boolean)
        .reduce((o, key) => (o && o[key] !== undefined) ? o[key] : undefined, obj);
}
