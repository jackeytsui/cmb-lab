type SearchableCourse = {
  title: string;
  summary: string | null;
};

function normalizeSearchText(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase().trim();
}

export function filterCourseLibraryCourses<T extends SearchableCourse>(
  courses: T[],
  query: string,
) {
  const terms = normalizeSearchText(query).split(/\s+/).filter(Boolean);

  if (terms.length === 0) {
    return courses;
  }

  return courses.filter((course) => {
    const searchableText = normalizeSearchText(
      `${course.title} ${course.summary ?? ""}`,
    );

    return terms.every((term) => searchableText.includes(term));
  });
}
