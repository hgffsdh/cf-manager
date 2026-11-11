using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MocCafe.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddInventoryCostStaffShifts2026 : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "DocumentNumber",
                table: "InventoryMovements",
                type: "nvarchar(80)",
                maxLength: 80,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "MovementType",
                table: "InventoryMovements",
                type: "nvarchar(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "Adjustment");

            migrationBuilder.AddColumn<decimal>(
                name: "StockAfter",
                table: "InventoryMovements",
                type: "decimal(18,3)",
                precision: 18,
                scale: 3,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SupplierName",
                table: "InventoryMovements",
                type: "nvarchar(160)",
                maxLength: 160,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<decimal>(
                name: "TotalCost",
                table: "InventoryMovements",
                type: "decimal(18,2)",
                precision: 18,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "UnitCost",
                table: "InventoryMovements",
                type: "decimal(18,4)",
                precision: 18,
                scale: 4,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "PreparationWorkEvents",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PreparationTaskId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ActorId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Action = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    Quantity = table.Column<int>(type: "int", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PreparationWorkEvents", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PreparationWorkEvents_PreparationTasks_PreparationTaskId",
                        column: x => x.PreparationTaskId,
                        principalTable: "PreparationTasks",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "StaffShifts",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    BranchId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: false),
                    StartAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    EndAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    Note = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StaffShifts", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "StaffShiftAssignments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShiftId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Duty = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    StationId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    AssignedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    AssignedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StaffShiftAssignments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_StaffShiftAssignments_StaffShifts_ShiftId",
                        column: x => x.ShiftId,
                        principalTable: "StaffShifts",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateIndex(
                name: "IX_InventoryMovements_CreatedAt_MovementType",
                table: "InventoryMovements",
                columns: new[] { "CreatedAt", "MovementType" });

            migrationBuilder.CreateIndex(
                name: "IX_PreparationWorkEvents_CreatedAt_ActorId",
                table: "PreparationWorkEvents",
                columns: new[] { "CreatedAt", "ActorId" });

            migrationBuilder.CreateIndex(
                name: "IX_PreparationWorkEvents_PreparationTaskId",
                table: "PreparationWorkEvents",
                column: "PreparationTaskId");

            migrationBuilder.CreateIndex(
                name: "IX_StaffShiftAssignments_ShiftId_UserId",
                table: "StaffShiftAssignments",
                columns: new[] { "ShiftId", "UserId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_StaffShifts_BranchId_StartAt",
                table: "StaffShifts",
                columns: new[] { "BranchId", "StartAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PreparationWorkEvents");

            migrationBuilder.DropTable(
                name: "StaffShiftAssignments");

            migrationBuilder.DropTable(
                name: "StaffShifts");

            migrationBuilder.DropIndex(
                name: "IX_InventoryMovements_CreatedAt_MovementType",
                table: "InventoryMovements");

            migrationBuilder.DropColumn(
                name: "DocumentNumber",
                table: "InventoryMovements");

            migrationBuilder.DropColumn(
                name: "MovementType",
                table: "InventoryMovements");

            migrationBuilder.DropColumn(
                name: "StockAfter",
                table: "InventoryMovements");

            migrationBuilder.DropColumn(
                name: "SupplierName",
                table: "InventoryMovements");

            migrationBuilder.DropColumn(
                name: "TotalCost",
                table: "InventoryMovements");

            migrationBuilder.DropColumn(
                name: "UnitCost",
                table: "InventoryMovements");
        }
    }
}
