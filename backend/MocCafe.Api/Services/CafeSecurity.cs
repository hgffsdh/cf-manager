using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using MocCafe.Api.Data;
using MocCafe.Api.Domain;

namespace MocCafe.Api.Services;

public static class CafeSecurity
{
    public static string Token() => Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant();
    public static string Hash(string token) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token))).ToLowerInvariant();
    public static Guid ActorId(ClaimsPrincipal user) => Guid.Parse(user.FindFirstValue(ClaimTypes.NameIdentifier)!);
    public static async Task<GuestSession?> Guest(HttpContext ctx, CafeDbContext db)
    {
        var token = ctx.Request.Headers["X-Guest-Token"].ToString();
        if (string.IsNullOrWhiteSpace(token) || token.Length > 256) return null;
        var hash = Hash(token);
        return await db.GuestSessions.Include(g => g.VisitSession)
            .FirstOrDefaultAsync(g => g.AccessTokenHash == hash && g.RevokedAt == null && g.ExpiresAt > DateTime.UtcNow && g.VisitSession.Status == "Open");
    }
}
