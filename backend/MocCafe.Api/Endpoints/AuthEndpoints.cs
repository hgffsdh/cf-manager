using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Identity;
using Microsoft.IdentityModel.Tokens;
using MocCafe.Api.Contracts;
using MocCafe.Api.Domain;

namespace MocCafe.Api.Endpoints;
public static class AuthEndpoints
{
    public static void MapAuth(this WebApplication app)
    {
        var api = app.MapGroup("/api/v1/auth").WithTags("Auth");
        api.MapPost("/login", async (LoginDto input, UserManager<CafeUser> users, IConfiguration cfg) =>
        {
            var user = await users.FindByEmailAsync(input.Email);
            if (user is null || !user.IsActive || !await users.CheckPasswordAsync(user, input.Password))
                return Results.Problem("Sai email hoặc mật khẩu", statusCode: 401);
            var claims = new List<Claim> { new(ClaimTypes.NameIdentifier, user.Id.ToString()), new(ClaimTypes.Email, user.Email!), new(ClaimTypes.Name, user.FullName) };
            var roles = await users.GetRolesAsync(user);
            claims.AddRange(roles.Select(r => new Claim(ClaimTypes.Role, r)));
            var secret = cfg["Jwt:Key"] ?? throw new Exception("Jwt:Key missing");
            var token = new JwtSecurityToken(cfg["Jwt:Issuer"], cfg["Jwt:Audience"], claims,
                expires: DateTime.UtcNow.AddHours(2), signingCredentials: new SigningCredentials(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret)), SecurityAlgorithms.HmacSha256));
            return Results.Ok(new { token = new JwtSecurityTokenHandler().WriteToken(token), name = user.FullName, roles });
        }).RequireRateLimiting("guest");
    }
}
