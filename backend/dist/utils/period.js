export function currentPeriodMonth() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
//# sourceMappingURL=period.js.map