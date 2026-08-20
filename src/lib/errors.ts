// 用途：全项目统一错误类型：Service 层抛 AppError（含 NotFoundError / ValidationError），API 层据此返回对应状态码与中文提示。
export class AppError extends Error {
  constructor(message: string, public code: string, public statusCode: number = 400) {
    super(message);
    this.name = "AppError";
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(message, "NOT_FOUND", 404);
    this.name = "NotFoundError";
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, "VALIDATION_ERROR", 400);
    this.name = "ValidationError";
  }
}

// 冲突错误：如创建同名但内容不同的技能时，返回 409 提示用户改名或先删除旧技能。
export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, "CONFLICT", 409);
    this.name = "ConflictError";
  }
}
