using System.Text.Json;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using MocCafe.Api.Data;
using MocCafe.Api.Domain;
using MocCafe.Api.Hubs;

namespace MocCafe.Api.Services;
public static class Events
{
    public static void Add(CafeDbContext db, string name, string group, object payload)
    {
        db.OutboxMessages.Add(new OutboxMessage { EventType = name, GroupName = group, Payload = JsonSerializer.Serialize(new { eventId = Guid.NewGuid(), occurredAt = DateTime.UtcNow, data = payload }) });
    }
    public static void AddBoth(CafeDbContext db, Guid visitId, string name, object payload)
    {
        Add(db, name, "staff", payload);
        Add(db, name, $"visit:{visitId}", payload);
    }
}

public class OutboxWorker(IServiceScopeFactory scopeFactory, ILogger<OutboxWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = scopeFactory.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<CafeDbContext>();
                var hub = scope.ServiceProvider.GetRequiredService<IHubContext<CafeHub>>();
                var items = await db.OutboxMessages.Where(x => x.ProcessedAt == null && x.RetryCount < 20)
                    .OrderBy(x => x.CreatedAt).Take(30).ToListAsync(stoppingToken);
                foreach (var item in items)
                {
                    try
                    {
                        await hub.Clients.Group(item.GroupName).SendCoreAsync(item.EventType, new object?[] { JsonSerializer.Deserialize<JsonElement>(item.Payload) }, stoppingToken);
                        item.ProcessedAt = DateTime.UtcNow;
                    }
                    catch (Exception e)
                    {
                        item.RetryCount++;
                        item.LastError = e.GetType().Name;
                        logger.LogWarning("Outbox delivery retry for {EventId}", item.Id);
                    }
                }
                await db.SaveChangesAsync(stoppingToken);
            }
            catch (Exception e) { logger.LogError(e, "Outbox worker failed"); }
            await Task.Delay(TimeSpan.FromSeconds(2), stoppingToken);
        }
    }
}
