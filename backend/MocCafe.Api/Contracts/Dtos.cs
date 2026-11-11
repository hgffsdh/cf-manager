using System.ComponentModel.DataAnnotations;
namespace MocCafe.Api.Contracts;

public record LoginDto([Required] string Email, [Required] string Password);
public record OpenVisitDto(int GuestCount = 2, bool IsDemo = false);
public record JoinGuestDto([Required] string QrToken);
public record QuoteDto(List<CartLineDto> Items);
public record CartLineDto(Guid VariantId, List<Guid>? ModifierOptionIds, int Quantity = 1, string? Note = null);
public record CreateOrderDto(List<CartLineDto> Items, string PaymentMethod, string IdempotencyKey, string? Note = null);
public record OrderDecisionDto(string? Reason = null);
public record QuantityDto(int Quantity = 1);
public record CashPaymentDto(decimal TenderedAmount);
public record ConfirmBankTransferDto(string BankTransactionId, string ConfirmedReferenceCode);
public record SupportDto(string Type, string? Note = null);
public record InventoryAdjustDto(decimal Delta, string Reason);
public record ReservationDto(Guid TableId, string CustomerName, string Phone, int GuestCount, DateTime StartAt, DateTime EndAt);
public record DemoPaymentDto(bool Succeed);
public record CafeTablePositionDto(int X, int Y);

public record ArchiveDemoVisitDto(string Reason);
