using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using MocCafe.Api.Data;
using MocCafe.Api.Services;

namespace MocCafe.Api.Hubs;
public class CafeHub(CafeDbContext db) : Hub
{
    public override async Task OnConnectedAsync()
    {
        if (Context.User?.Identity?.IsAuthenticated == true)
            await Groups.AddToGroupAsync(Context.ConnectionId, "staff");
        await base.OnConnectedAsync();
    }
    // Authorization is server-side: never accept an arbitrary visitId from browser.
    public async Task JoinVisit(string guestToken)
    {
        if (string.IsNullOrWhiteSpace(guestToken) || guestToken.Length > 256) throw new HubException("Invalid token");
        var hash = CafeSecurity.Hash(guestToken);
        var guest = await db.GuestSessions.Include(x => x.VisitSession).FirstOrDefaultAsync(x => x.AccessTokenHash == hash && x.RevokedAt == null && x.ExpiresAt > DateTime.UtcNow && x.VisitSession.Status == "Open");
        if (guest == null) throw new HubException("Access denied");
        await Groups.AddToGroupAsync(Context.ConnectionId, $"visit:{guest.VisitSessionId}");
    }
}
