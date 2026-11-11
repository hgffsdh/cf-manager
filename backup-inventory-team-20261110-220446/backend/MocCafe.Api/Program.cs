using System.Text;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using MocCafe.Api.Data;
using MocCafe.Api.Domain;
using MocCafe.Api.Endpoints;
using MocCafe.Api.Hubs;
using MocCafe.Api.Services;

var builder = WebApplication.CreateBuilder(args);
var connection = builder.Configuration.GetConnectionString("DefaultConnection")
    ?? throw new InvalidOperationException("Cần ConnectionStrings:DefaultConnection (SQL Server)");
var jwtKey = builder.Configuration["Jwt:Key"];
if (string.IsNullOrWhiteSpace(jwtKey) || Encoding.UTF8.GetByteCount(jwtKey) < 32)
    throw new InvalidOperationException("Cần Jwt:Key tối thiểu 32 bytes, đọc từ environment/secret store.");
builder.Services.AddDbContext<CafeDbContext>(o => o.UseSqlServer(connection));
builder.Services.AddIdentityCore<CafeUser>(o => { o.Password.RequiredLength = 8; o.User.RequireUniqueEmail = true; })
    .AddRoles<IdentityRole<Guid>>().AddEntityFrameworkStores<CafeDbContext>();
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer(options =>
{
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true, ValidIssuer = builder.Configuration["Jwt:Issuer"] ?? "MocCafe",
        ValidateAudience = true, ValidAudience = builder.Configuration["Jwt:Audience"] ?? "MocCafeWeb",
        ValidateIssuerSigningKey = true, IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey)),
        ValidateLifetime = true, ClockSkew = TimeSpan.FromMinutes(1)
    };
    options.Events = new JwtBearerEvents { OnMessageReceived = context =>
    {
        if (context.Request.Path.StartsWithSegments("/hubs/cafe") && context.Request.Query.TryGetValue("access_token", out var token))
            context.Token = token;
        return Task.CompletedTask;
    } };
});
builder.Services.AddAuthorization(o =>
{
    o.AddPolicy("ManagerOnly", p => p.RequireRole("Owner", "Manager"));
    o.AddPolicy("OrdersView", p => p.RequireRole("Owner", "Manager", "Cashier", "Barista", "Waiter"));
    o.AddPolicy("AcceptOrders", p => p.RequireRole("Owner", "Manager"));
    o.AddPolicy("Kitchen", p => p.RequireRole("Owner", "Manager", "Barista"));
    o.AddPolicy("Floor", p => p.RequireRole("Owner", "Manager", "Waiter"));
    o.AddPolicy("Cashier", p => p.RequireRole("Owner", "Manager", "Cashier"));
    o.AddPolicy("Inventory", p => p.RequireRole("Owner", "Manager", "InventoryStaff"));
    o.AddPolicy("Reports", p => p.RequireRole("Owner", "Manager"));
});
builder.Services.AddSignalR();
builder.Services.AddHostedService<OutboxWorker>();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddHealthChecks().AddDbContextCheck<CafeDbContext>();
var origins = (builder.Configuration["Cors:Origins"] ?? "http://localhost:5173").Split(';', StringSplitOptions.RemoveEmptyEntries);
builder.Services.AddCors(o => o.AddPolicy("Web", p => p.WithOrigins(origins).AllowAnyHeader().AllowAnyMethod().AllowCredentials()));
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = 429;
    options.AddPolicy("guest", context => RateLimitPartition.GetFixedWindowLimiter(
        context.Connection.RemoteIpAddress?.ToString() ?? "unknown", _ => new FixedWindowRateLimiterOptions { PermitLimit = 100, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
});
var app = builder.Build();
app.UseExceptionHandler(handler => handler.Run(async context =>
{
    var exception = context.Features.Get<Microsoft.AspNetCore.Diagnostics.IExceptionHandlerFeature>()?.Error;
    var log = context.RequestServices.GetRequiredService<ILoggerFactory>().CreateLogger("Exceptions");
    if (exception != null) log.LogError(exception, "Unhandled error");
    context.Response.StatusCode = 500;
    await context.Response.WriteAsJsonAsync(new { message = "Máy chủ gặp lỗi, vui lòng thử lại", correlationId = context.TraceIdentifier });
}));
if (app.Environment.IsDevelopment()) { app.UseSwagger(); app.UseSwaggerUI(); }
app.UseCors("Web");
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();
app.MapHealthChecks("/health");
app.MapHub<CafeHub>("/hubs/cafe");
app.MapAuth();
app.MapGuest();
app.MapNavigation();
app.MapStaff();
app.MapPayments();
app.MapOperations();
app.MapHistory();
app.MapMenuManagement();
if (app.Environment.IsDevelopment() && app.Configuration.GetValue<bool>("Bootstrap:EnsureCreated"))
{
    using var scope = app.Services.CreateScope();
    await scope.ServiceProvider.GetRequiredService<CafeDbContext>().Database.EnsureCreatedAsync();
}
if (app.Environment.IsDevelopment() && app.Configuration.GetValue<bool>("Seed:Enabled"))
    await SeedData.RunAsync(app.Services, app.Configuration);
app.Run();

public partial class Program { }
