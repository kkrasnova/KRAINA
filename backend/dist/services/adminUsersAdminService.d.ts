export type AdminListRow = {
    user_id: string;
    email: string;
    role: string;
    status: string;
    auth_provider: string | null;
    username: string | null;
    display_name: string | null;
    created_at: string | null;
};
export declare function listAdminUsers(): Promise<AdminListRow[]>;
/**
 * Makes email an admin. Creates a stub user if missing so they can sign in
 * via Google (or email/password after setting a password elsewhere).
 */
export declare function grantAdminByEmail(emailRaw: string): Promise<AdminListRow>;
export declare function revokeAdminByEmail(emailRaw: string, actorUserId: string): Promise<{
    ok: true;
}>;
//# sourceMappingURL=adminUsersAdminService.d.ts.map