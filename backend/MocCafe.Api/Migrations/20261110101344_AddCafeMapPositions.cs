using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MocCafe.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddCafeMapPositions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "MapX",
                table: "CafeTables",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "MapY",
                table: "CafeTables",
                type: "int",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "MapX",
                table: "CafeTables");

            migrationBuilder.DropColumn(
                name: "MapY",
                table: "CafeTables");
        }
    }
}
