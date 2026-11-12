using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MocCafe.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddOrderServedAt20261112 : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "ServedAt",
                table: "Orders",
                type: "datetime2",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ServedAt",
                table: "Orders");
        }
    }
}
