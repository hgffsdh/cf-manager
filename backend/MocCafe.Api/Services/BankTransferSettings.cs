using System.Globalization;
using System.Text.RegularExpressions;

namespace MocCafe.Api.Services;

/// <summary>Real bank transfer QR: gives payment instructions only, never confirms receipt.</summary>
public static class BankTransferSettings
{
    public static bool TryGet(IConfiguration config, out string bankId, out string accountNo, out string accountName)
    {
        bankId = (config["BankTransfer:BankId"] ?? "").Trim();
        accountNo = (config["BankTransfer:AccountNo"] ?? "").Trim();
        accountName = (config["BankTransfer:AccountName"] ?? "").Trim();
        return Regex.IsMatch(bankId, "^[a-zA-Z0-9]{2,16}$")
            && Regex.IsMatch(accountNo, "^[0-9]{6,19}$")
            && Regex.IsMatch(accountName, "^[a-zA-Z0-9 ]{5,50}$");
    }

    public static object Info(IConfiguration config, string reference, decimal amount)
    {
        if (!TryGet(config, out var bank, out var account, out var name))
            throw new InvalidOperationException("Chưa cấu hình tài khoản ngân hàng nhận tiền thật.");
        var value = decimal.Truncate(amount);
        if (value != amount || value <= 0m || value > 9999999999999m)
            throw new InvalidOperationException("Số tiền chuyển khoản phải là số nguyên VND hợp lệ.");
        var qrUrl = $"https://img.vietqr.io/image/{bank}-{account}-compact2.png"
            + $"?amount={value.ToString(CultureInfo.InvariantCulture)}&addInfo={Uri.EscapeDataString(reference)}&accountName={Uri.EscapeDataString(name)}";
        return new { bankId = bank, accountNo = account, accountName = name, amount = value, referenceCode = reference,
            qrImageUrl = qrUrl, verified = false,
            instruction = "Chuyển đúng số tiền và nội dung. Giao dịch chỉ thành công khi thu ngân đối chiếu được tiền thực vào tài khoản." };
    }
}
