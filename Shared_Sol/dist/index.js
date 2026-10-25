"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthTokenType = exports.EmailOutboxStatus = exports.AuditEventType = exports.AccountState = exports.ArousalLevel = exports.SystemPriority = void 0;
__exportStar(require("./ast.js"), exports);
/**
 * Solyra Core Types & System Contracts
 */
exports.SystemPriority = {
    REFLEX: 'REFLEX',
    SURVIVAL: 'SURVIVAL',
    USER: 'USER',
    LEARNING: 'LEARNING',
    IDLE: 'IDLE',
    NORMAL: 'USER'
};
exports.ArousalLevel = {
    SLEEP: 'sleep',
    DROWSY: 'drowsy',
    ALERT: 'alert',
    HYPERAROUSED: 'hyperaroused',
    ENGAGED: 'alert'
};
var AccountState;
(function (AccountState) {
    AccountState["REGISTERED"] = "REGISTERED";
    AccountState["PENDING_VERIFICATION"] = "PENDING_VERIFICATION";
    AccountState["ACTIVE"] = "ACTIVE";
    AccountState["SUSPENDED"] = "SUSPENDED";
    AccountState["DELETION_PENDING"] = "DELETION_PENDING";
    AccountState["DELETED"] = "DELETED";
})(AccountState || (exports.AccountState = AccountState = {}));
var AuditEventType;
(function (AuditEventType) {
    AuditEventType["USER_SIGNUP"] = "USER_SIGNUP";
    AuditEventType["USER_LOGIN"] = "USER_LOGIN";
    AuditEventType["USER_LOGOUT"] = "USER_LOGOUT";
    AuditEventType["PASSWORD_RESET_REQUESTED"] = "PASSWORD_RESET_REQUESTED";
    AuditEventType["PASSWORD_RESET_COMPLETED"] = "PASSWORD_RESET_COMPLETED";
    AuditEventType["EMAIL_VERIFIED"] = "EMAIL_VERIFIED";
    AuditEventType["SESSION_REVOKED"] = "SESSION_REVOKED";
    AuditEventType["ONBOARDING_COMPLETED"] = "ONBOARDING_COMPLETED";
    AuditEventType["PACKAGE_ACTIVATED"] = "PACKAGE_ACTIVATED";
    AuditEventType["PACKAGE_DEACTIVATED"] = "PACKAGE_DEACTIVATED";
    AuditEventType["PACKAGE_ROLLED_BACK"] = "PACKAGE_ROLLED_BACK";
    AuditEventType["ADMIN_ACTION"] = "ADMIN_ACTION";
})(AuditEventType || (exports.AuditEventType = AuditEventType = {}));
var EmailOutboxStatus;
(function (EmailOutboxStatus) {
    EmailOutboxStatus["PENDING"] = "PENDING";
    EmailOutboxStatus["SENT"] = "SENT";
    EmailOutboxStatus["FAILED"] = "FAILED";
})(EmailOutboxStatus || (exports.EmailOutboxStatus = EmailOutboxStatus = {}));
var AuthTokenType;
(function (AuthTokenType) {
    AuthTokenType["EMAIL_VERIFICATION"] = "EMAIL_VERIFICATION";
    AuthTokenType["PASSWORD_RESET"] = "PASSWORD_RESET";
    AuthTokenType["REFRESH"] = "REFRESH";
})(AuthTokenType || (exports.AuthTokenType = AuthTokenType = {}));
// Phase 1: Council, Package Manifest, and AST contracts
__exportStar(require("./council"), exports);
__exportStar(require("./package"), exports);
__exportStar(require("./ast"), exports);
