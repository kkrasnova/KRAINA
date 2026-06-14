export class HttpError extends Error {
    status;
    code;
    constructor(status, code, message) {
        super(message ?? code);
        this.name = 'HttpError';
        this.status = status;
        this.code = code;
    }
}
//# sourceMappingURL=HttpError.js.map