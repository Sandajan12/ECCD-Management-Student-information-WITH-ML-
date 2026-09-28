export function calculateDecimalAge(dateOfBirth: string | Date, targetDate: string | Date = new Date()) {
    if (!dateOfBirth) return '';
    const dob = new Date(dateOfBirth);
    const target = new Date(targetDate);
    let months = (target.getFullYear() - dob.getFullYear()) * 12;
    months -= dob.getMonth();
    months += target.getMonth();
    if (target.getDate() < dob.getDate()) {
        months--;
    }
    const years = Math.floor(months / 12);
    const remainingMonths = months % 12;
    return `${years}.${remainingMonths}`;
}
