import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { hasMinimumRole } from "@/lib/auth";
import { getActiveStudent } from "@/lib/active-student-queries";
import { ErrorAlert } from "@/components/ui/error-alert";
import { ArrowLeft, ExternalLink, Info, User, Mail, Phone, MapPin, Tag, Calendar, Globe, FileText } from "lucide-react";
import { format } from "date-fns";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ contactId: string }>;
}

export default async function ActiveStudentDetailPage({ params }: PageProps) {
  // Verify user has coach+ role
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    redirect("/dashboard");
  }

  const { contactId } = await params;

  let student;
  try {
    student = await getActiveStudent(contactId);
  } catch (err) {
    console.error("Failed to fetch active student:", err);
    return (
      <div className="container mx-auto px-4 py-8">
         <Link
          href="/admin/users?tab=ghl"
          className="mb-6 inline-flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Active Students
        </Link>
        <ErrorAlert message="Failed to load student details." variant="block" />
      </div>
    );
  }

  if (!student) {
    notFound();
  }

  const displayName = `${student.firstName || ""} ${student.lastName || ""}`.trim() || "Unknown";
  const ghlUrl = `https://app.gohighlevel.com/location/JOdDwlRF2K16cnIYW9Er/customers/detail/${student.contactId}`;

  // Helper to format date if exists
  const formatDate = (date: Date | null | undefined) => {
    if (!date) return "--";
    return format(new Date(date), "MMM d, yyyy h:mm a");
  };

  // Helper to format labels (camelCase/snake_case to Title Case)
  const formatLabel = (key: string) => {
    // 1. Replace underscores with spaces
    // 2. Insert space before capital letters
    // 3. Capitalize first letter
    const label = key
      .replace(/_/g, " ")
      .replace(/([A-Z])/g, " $1")
      .trim();
    return label.charAt(0).toUpperCase() + label.slice(1);
  };

  // Define keys for specific sections to exclude from "Other Details"
  const contactKeys = new Set([
    "firstName", "lastName", "email", "phone", 
    "fullAddress", "city", "state", "country", "postalCode", "timezone",
    "streetAddress" // in case it differs
  ]);
  
  const systemKeys = new Set([
    "contactId", "created", "updated", "lastActivity", "source", "tags",
    "lastPortalLogin", "loginCounter"
  ]);

  // Filter "Other" keys
  const otherDetails = Object.entries(student).filter(([key, value]) => {
    // Exclude keys already shown in specific sections
    if (contactKeys.has(key) || systemKeys.has(key)) return false;
    
    // Exclude null, undefined, or empty string values
    if (value === null || value === undefined || value === "") return false;

    return true;
  }).sort((a, b) => a[0].localeCompare(b[0])); // Sort alphabetically

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Breadcrumb */}
      <nav className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/admin" className="transition-colors hover:text-foreground">
          Admin
        </Link>
        <ArrowLeft className="w-4 h-4" />
        <Link href="/admin/users?tab=ghl" className="transition-colors hover:text-foreground">
          Active Students (GHL)
        </Link>
        <ArrowLeft className="w-4 h-4" />
        <span className="text-foreground">{displayName}</span>
      </nav>

      <div className="flex flex-col md:flex-row gap-6 items-start justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">{displayName}</h1>
          <p className="flex items-center gap-2 text-muted-foreground">
            <Mail className="w-4 h-4" /> {student.email || "No email"}
          </p>
        </div>
        
        <div className="flex flex-col items-end gap-2">
           <a 
            href={ghlUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground transition-colors hover:bg-primary/90"
           >
             View in GoHighLevel
             <ExternalLink className="w-4 h-4" />
           </a>
           <div className="flex items-center gap-1.5 rounded border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs text-amber-700 dark:text-amber-300">
             <Info className="w-3 h-3" />
             Read-only view. Edit in GHL.
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* Contact Info Card */}
        <div className="rounded-lg border border-border bg-card p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            Contact Information
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-4">
             <InfoRow label="Phone" value={student.phone} icon={<Phone className="w-4 h-4" />} />
             <InfoRow label="Email" value={student.email} icon={<Mail className="w-4 h-4" />} />
             <InfoRow label="Address" value={student.fullAddress} icon={<MapPin className="w-4 h-4" />} fullWidth />
             <InfoRow label="City" value={student.city} />
             <InfoRow label="State" value={student.state} />
             <InfoRow label="Country" value={student.country} icon={<Globe className="w-4 h-4" />} />
             <InfoRow label="Postal Code" value={student.postalCode} />
             <InfoRow label="Timezone" value={student.timezone} />
          </div>
        </div>

        {/* System Info Card */}
        <div className="rounded-lg border border-border bg-card p-6">
           <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Tag className="h-5 w-5 text-primary" />
            System & Tags
          </h2>
          <div className="space-y-4">
            <div>
              <span className="mb-1 block text-sm text-muted-foreground">Tags</span>
              <div className="flex flex-wrap gap-1">
                {student.tags ? student.tags.split(",").map((tag, i) => (
                  <span key={i} className="rounded border border-border bg-muted px-2 py-1 text-xs text-foreground">
                    {tag.trim()}
                  </span>
                )) : <span className="text-muted-foreground">--</span>}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-4">
               <InfoRow label="Contact ID" value={student.contactId} fullWidth />
               <InfoRow label="Created" value={formatDate(student.created)} icon={<Calendar className="w-4 h-4" />} />
               <InfoRow label="Updated" value={formatDate(student.updated)} />
               <InfoRow label="Last Activity" value={student.lastActivity} />
               <InfoRow label="Source" value={student.source} />
            </div>
          </div>
        </div>
      </div>
      
      {/* Other Details - Dynamic Grid */}
      {otherDetails.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-6">
           <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Other Details
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {otherDetails.map(([key, value]) => (
               <InfoRow 
                  key={key} 
                  label={formatLabel(key)} 
                  value={value instanceof Date ? formatDate(value) : value} 
               />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({ 
  label, 
  value, 
  icon,
  fullWidth = false
}: { 
  label: string; 
  value: string | number | null | undefined | Date; 
  icon?: React.ReactNode;
  fullWidth?: boolean;
}) {
   const displayValue = value === null || value === undefined || value === "" ? "--" : String(value);

   return (
     <div className={`flex flex-col ${fullWidth ? 'col-span-1 sm:col-span-2' : ''}`}>
       <span className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
         {icon}
         {label}
       </span>
       <span className="break-words whitespace-pre-wrap text-sm text-foreground">{displayValue}</span>
     </div>
   );
}
