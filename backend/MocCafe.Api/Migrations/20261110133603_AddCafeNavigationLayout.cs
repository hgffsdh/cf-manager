using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MocCafe.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddCafeNavigationLayout : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "CafeNavigationLayouts",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    BranchId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    LayoutJson = table.Column<string>(type: "nvarchar(max)", maxLength: 30000, nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CafeNavigationLayouts", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_CafeNavigationLayouts_BranchId",
                table: "CafeNavigationLayouts",
                column: "BranchId",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CafeNavigationLayouts");
        }
    }
}
