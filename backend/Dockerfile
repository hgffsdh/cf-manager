FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY MocCafe.Api/*.csproj MocCafe.Api/
RUN dotnet restore MocCafe.Api/MocCafe.Api.csproj
COPY MocCafe.Api/ MocCafe.Api/
RUN dotnet publish MocCafe.Api/MocCafe.Api.csproj -c Release -o /out --no-restore
FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app
COPY --from=build /out .
ENV ASPNETCORE_HTTP_PORTS=8080
EXPOSE 8080
ENTRYPOINT ["dotnet", "MocCafe.Api.dll"]
